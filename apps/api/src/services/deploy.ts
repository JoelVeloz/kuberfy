import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Docker from "dockerode";
import { and, eq, inArray } from "drizzle-orm";
import simpleGit from "simple-git";
import { db } from "../db";
import { application, deployment, domain } from "../db/schema/app";

export const docker = new Docker();
// Deployed apps get their own network, separate from kuberfy-network (where kuberfy's own dashboard/API and its
// Docker-socket access live) — a shell inside a deployed container can no longer reach kuberfy itself. Traefik joins
// both networks so it can still route to everything.
const DEPLOY_NETWORK = "kuberfy-apps-network";

// In-progress build output, so a build-log page opened mid-build can catch up instantly instead of waiting for the next line.
export const activeBuildLogs = new Map<string, string[]>();
// One shared emitter: "line" events carry `${deploymentId}\n${text}`, "done" events carry the deploymentId — keeps the
// live build-log WebSocket (routes/applications.ts) decoupled from the deploy pipeline without a queue/broker dependency.
export const buildLogEvents = new EventEmitter();

export interface DockerStatsSample {
  cpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage?: number; online_cpus?: number };
  precpu_stats: { cpu_usage: { total_usage: number }; system_cpu_usage?: number };
  memory_stats: { usage?: number; limit?: number; stats?: { cache?: number } };
}

// Same formula `docker stats` itself uses: usage since the previous sample as a share of the host's usage since
// then, times CPU count. The very first sample has no precpu_stats.system_cpu_usage yet, so it reports 0% briefly.
export function parseDockerStats(raw: DockerStatsSample) {
  const cpuDelta = raw.cpu_stats.cpu_usage.total_usage - raw.precpu_stats.cpu_usage.total_usage;
  const systemDelta = (raw.cpu_stats.system_cpu_usage ?? 0) - (raw.precpu_stats.system_cpu_usage ?? 0);
  const cpuPercent = systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * (raw.cpu_stats.online_cpus ?? 1) * 100 : 0;
  const memUsed = (raw.memory_stats.usage ?? 0) - (raw.memory_stats.stats?.cache ?? 0);
  return { t: Date.now(), cpu: Math.round(cpuPercent * 10) / 10, memUsed, memLimit: raw.memory_stats.limit ?? 0 };
}

// A deployment stuck in "pending"/"building" from before this process started can only mean the previous process
// died mid-deploy — nothing else clears that state, so a stuck row otherwise stays that way forever (the container
// may well have started fine; the DB update for it just never landed). Run once at boot.
export async function reconcileInterruptedDeployments() {
  await db
    .update(deployment)
    .set({ status: "failed", logs: "Interrupted by a server restart. Redeploy to try again.", updatedAt: new Date() })
    .where(inArray(deployment.status, ["pending", "building"]));
}

export async function runDeployment(applicationId: string) {
  const app = await db.query.application.findFirst({ where: eq(application.id, applicationId) });
  if (!app) return null;

  const [dep] = await db.insert(deployment).values({ applicationId, status: "building" }).returning();

  deploy(app, dep!.id).catch(async (err) => {
    await db
      .update(deployment)
      .set({ status: "failed", logs: err instanceof Error ? err.message : String(err), updatedAt: new Date() })
      .where(eq(deployment.id, dep!.id));
    finishBuildLog(dep!.id);
  });

  return dep!;
}

function finishBuildLog(deploymentId: string) {
  activeBuildLogs.delete(deploymentId);
  buildLogEvents.emit("done", deploymentId);
}

async function deploy(app: typeof application.$inferSelect, deploymentId: string) {
  const logs: string[] = [];
  activeBuildLogs.set(deploymentId, logs);
  const log = (line: string) => {
    logs.push(line);
    buildLogEvents.emit("line", deploymentId, line);
  };

  const imageTag = app.buildType === "image" ? app.repoUrl : `kuberfy/${app.id}:${Date.now()}`;

  if (app.buildType === "image") {
    await pullImage(imageTag, log);
  } else {
    await buildFromGit(app, imageTag, log);
  }

  const containerName = `kuberfy-${app.id}`;
  await removeExisting(containerName);

  const domains = await db.query.domain.findMany({ where: eq(domain.applicationId, app.id) });
  const labels: Record<string, string> = { "kuberfy.application": app.id };
  if (domains.length > 0) {
    labels["traefik.enable"] = "true";
    // one router+service per domain (not one shared router) — different domains of the same app can point at different ports
    for (const d of domains) {
      const routerName = `${app.id}-${d.id}`;
      // `.localhost` never leaves the machine and Let's Encrypt won't issue for it — HTTP only regardless of the
      // toggle. Any real host (a custom domain, or the sslip.io ones auto-generated in production) gets a TLS
      // router too, unless the user turned sslEnabled off for it (domains.ts already refuses that combination
      // for `.localhost`, so this only actually happens for a real host that opted out).
      const isLocalhost = d.host === "localhost" || d.host.endsWith(".localhost");
      const tlsRouter = d.sslEnabled && !isLocalhost;
      labels[`traefik.http.routers.${routerName}.rule`] = `Host(\`${d.host}\`)`;
      labels[`traefik.http.routers.${routerName}.entrypoints`] = "web";
      labels[`traefik.http.routers.${routerName}.service`] = routerName;
      labels[`traefik.http.services.${routerName}.loadbalancer.server.port`] = String(d.port);
      if (tlsRouter) {
        const tlsRouterName = `${routerName}-tls`;
        labels[`traefik.http.routers.${tlsRouterName}.rule`] = `Host(\`${d.host}\`)`;
        labels[`traefik.http.routers.${tlsRouterName}.entrypoints`] = "websecure";
        labels[`traefik.http.routers.${tlsRouterName}.service`] = routerName;
        labels[`traefik.http.routers.${tlsRouterName}.tls.certresolver`] = "le";
      }
      log(`Routing ${d.host} → internal port ${d.port} via Traefik${tlsRouter ? " (HTTP + HTTPS via Let's Encrypt)" : ""}`);
    }
  }

  const env = app.envVars ? Object.entries(JSON.parse(app.envVars) as Record<string, string>).map(([k, v]) => `${k}=${v}`) : undefined;

  log(`Creating container ${containerName} from ${imageTag}`);
  const container = await docker.createContainer({
    name: containerName,
    Image: imageTag,
    Tty: true,
    Env: env,
    Labels: labels,
    HostConfig: {
      RestartPolicy: { Name: "unless-stopped" },
      NetworkMode: DEPLOY_NETWORK,
      // MemorySwap === Memory disables swap on top of the hard cap, matching how the limit reads in the UI
      Memory: app.memoryLimitMb * 1024 * 1024,
      MemorySwap: app.memoryLimitMb * 1024 * 1024,
    },
  });
  await container.start();
  log(`Container started (${container.id.slice(0, 12)})`);

  // A container can exit almost immediately (e.g. a required env var is missing) — briefly
  // wait and check before declaring victory, instead of trusting `start()` alone.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const info = await container.inspect();
  if (!info.State.Running) {
    const crashLogs = await container.logs({ stdout: true, stderr: true, tail: 100 });
    log(`Container exited (code ${info.State.ExitCode}):`);
    log(crashLogs.toString("utf-8").trimEnd());
    await db
      .update(deployment)
      .set({ status: "failed", imageTag, containerId: container.id, logs: logs.join("\n"), updatedAt: new Date() })
      .where(eq(deployment.id, deploymentId));
    finishBuildLog(deploymentId);
    return;
  }

  await db
    .update(deployment)
    .set({ status: "stopped", updatedAt: new Date() })
    .where(and(eq(deployment.applicationId, app.id), eq(deployment.status, "running")));

  await db
    .update(deployment)
    .set({ status: "running", imageTag, containerId: container.id, logs: logs.join("\n"), updatedAt: new Date() })
    .where(eq(deployment.id, deploymentId));
  finishBuildLog(deploymentId);
}

export async function restartDeployment(applicationId: string) {
  const dep = await latestDeployment(applicationId);
  if (!dep?.containerId) return null;
  await docker.getContainer(dep.containerId).restart();
  await db.update(deployment).set({ status: "running", updatedAt: new Date() }).where(eq(deployment.id, dep.id));
  return dep;
}

export async function stopDeployment(applicationId: string) {
  const dep = await latestDeployment(applicationId);
  if (!dep?.containerId) return null;
  await docker.getContainer(dep.containerId).stop();
  await db.update(deployment).set({ status: "stopped", updatedAt: new Date() }).where(eq(deployment.id, dep.id));
  return dep;
}

export function latestDeployment(applicationId: string) {
  return db.query.deployment.findFirst({
    where: (fields, { eq }) => eq(fields.applicationId, applicationId),
    orderBy: (fields, { desc }) => [desc(fields.createdAt)],
  });
}

async function pullImage(image: string, log: (line: string) => void) {
  log(`Pulling ${image}`);
  const stream = await docker.pull(image);
  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      (err: Error | null) => (err ? reject(err) : resolve()),
      (event: { status?: string }) => event.status && log(event.status),
    );
  });
}

async function buildFromGit(app: typeof application.$inferSelect, imageTag: string, log: (line: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "kuberfy-build-"));
  try {
    log(`Cloning ${app.repoUrl} (${app.branch})`);
    await simpleGit().clone(app.repoUrl, dir, ["--depth", "1", "--branch", app.branch]);

    log(`Building ${imageTag}`);
    const stream = await docker.buildImage({ context: dir, src: ["."] }, { t: imageTag, dockerfile: app.dockerfilePath ?? "Dockerfile" });
    await new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(
        stream,
        (err: Error | null, res: Array<{ error?: string }>) => {
          const buildError = res?.find((r) => r.error)?.error;
          if (err) reject(err);
          else if (buildError) reject(new Error(buildError));
          else resolve();
        },
        (event: { stream?: string }) => event.stream && log(event.stream.trimEnd()),
      );
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function removeExisting(name: string) {
  const existing = docker.getContainer(name);
  try {
    await existing.remove({ force: true });
  } catch {
    // no existing container with this name — nothing to remove
  }
}
