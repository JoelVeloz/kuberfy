import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { cpus, tmpdir, totalmem } from "node:os";
import { basename, dirname, join } from "node:path";
import Docker from "dockerode";
import { and, eq, inArray } from "drizzle-orm";
import simpleGit from "simple-git";
import { db } from "../db";
import { application, deployment, domain, volume } from "../db/schema/app";

export const docker = new Docker();
// Deployed apps get their own network, separate from kuberfy-network (where kuberfy's own dashboard/API and its
// Docker-socket access live) — a shell inside a deployed container can no longer reach kuberfy itself. Traefik joins
// both networks so it can still route to everything.
const DEPLOY_NETWORK = "kuberfy-apps-network";

// dockerode's pull/build streams have no built-in ceiling — a stalled registry connection or a `followProgress`
// callback that never fires (observed for real: the image had already finished downloading on the daemon, but the
// stream's completion callback never resolved the wrapping Promise) otherwise leaves a deployment stuck in
// "building" forever, with no way for a user to recover except going around the panel straight to Docker.
const DEPLOY_TIMEOUT_MS = 10 * 60 * 1000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([promise, new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error(message)), ms))]);
}

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

export async function reconcileInterruptedDeployments() {
  await db
    .update(deployment)
    .set({ status: "failed", logs: "Interrupted by a server restart. Redeploy to try again.", updatedAt: new Date() })
    .where(inArray(deployment.status, ["pending", "building"]));
}

// A reconciliation loop, the same pattern Kubernetes controllers use: never trust a status written once at
// deploy time, periodically compare it against the live Swarm state and correct drift in either direction.
// Nothing else re-checks a deployment's stored status once deploy() below stops watching it, so left alone
// the DB can permanently disagree with reality three ways:
//   - "failed": the 30s task-readiness check in deploy() can give up on a service that goes on to become
//     healthy moments later (its own RestartPolicy keeps retrying) — heavy concurrent load makes this common.
//   - "building" with no progress in a while: the process running deploy() died (e.g. was itself the one
//     redeployed, or crashed) before it could record an outcome — left alone this spins forever in the UI.
//   - "running" for a service that no longer exists at all (removed outside the normal delete flow, or lost
//     across some other interruption) — nothing currently ever un-marks that.
const STALE_BUILDING_MS = 3 * 60 * 1000;

export async function reconcileDeploymentStatuses() {
  // Only ever the latest deployment per application — never a historical row. deploy() guarantees at most one
  // "running" row per app by stopping any other before setting a new one; touching older rows here (a bug that
  // shipped earlier tonight) breaks that guarantee; e.g. two old rows with no containerId both fall back to the
  // same deterministic service name below and can both get flipped to "running" at once.
  const apps = await db.query.application.findMany();
  const rows = (await Promise.all(apps.map((a) => latestDeployment(a.id)))).filter(
    (d): d is NonNullable<typeof d> => d !== undefined && ["failed", "building", "running"].includes(d.status),
  );
  for (const dep of rows) {
    if (dep.status === "building" && Date.now() - dep.updatedAt.getTime() < STALE_BUILDING_MS) continue;

    const serviceRef = dep.containerId ?? `kuberfy-${dep.applicationId}`;
    let isRunning = false;
    try {
      const tasks = await docker.listTasks({ filters: { service: [serviceRef] } });
      isRunning = tasks.some((t) => t.Status?.State === "running");
    } catch {
      // service doesn't exist (never created, or removed since) — isRunning stays false
    }

    if (isRunning) {
      if (dep.status !== "running") await db.update(deployment).set({ status: "running", updatedAt: new Date() }).where(eq(deployment.id, dep.id));
    } else if (dep.status !== "failed") {
      await db
        .update(deployment)
        .set({ status: "failed", logs: `${dep.logs ?? ""}\nNo running service found for this deployment. Redeploy to try again.`, updatedAt: new Date() })
        .where(eq(deployment.id, dep.id));
    }
  }
}

export async function runDeployment(applicationId: string) {
  const app = await db.query.application.findFirst({ where: eq(application.id, applicationId) });
  if (!app) return null;

  const [dep] = await db.insert(deployment).values({ applicationId, status: "building" }).returning();

  withTimeout(deploy(app, dep!.id), DEPLOY_TIMEOUT_MS, "Deploy timed out after 10 minutes").catch(async (err) => {
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
    const auth = app.registryUsername && app.registryPassword ? { username: app.registryUsername, password: app.registryPassword } : undefined;
    await pullImage(imageTag, log, auth);
  } else {
    await buildFromGit(app, imageTag, log);
  }

  const serviceName = `kuberfy-${app.id}`;
  await removeExisting(serviceName);

  const domains = await db.query.domain.findMany({ where: eq(domain.applicationId, app.id) });
  const labels: Record<string, string> = { "kuberfy.application": app.id };
  if (domains.length > 0) {
    labels["traefik.enable"] = "true";
    // one router+service per domain (not one shared router) — different domains of the same app can point at different ports
    for (const d of domains) {
      const routerName = `${app.id}-${d.id}`;
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

  const appVolumes = await db.query.volume.findMany({ where: eq(volume.applicationId, app.id) });
  const mounts = appVolumes.map((v) => ({ Type: "volume" as const, Source: v.volumeName, Target: v.mountPath }));
  for (const v of appVolumes) log(`Mounting persistent volume at ${v.mountPath}`);

  log(`Creating service ${serviceName} from ${imageTag}`);
  // A Swarm service, not a plain container — Traefik's swarm provider only ever sees labels on the service
  // itself (never on the task's real container), so this is what makes deployed apps show up in Traefik
  // without a second, container-level provider running alongside it.
  const service = await docker.createService({
    Name: serviceName,
    Labels: labels,
    TaskTemplate: {
      ContainerSpec: { Image: imageTag, Env: env, Mounts: mounts, TTY: true },
      RestartPolicy: { Condition: "any" },
      Resources: { Limits: { MemoryBytes: app.memoryLimitMb * 1024 * 1024, NanoCPUs: Math.round(app.cpuLimit * 1_000_000_000) } },
      Networks: [{ Target: DEPLOY_NETWORK }],
    },
    Mode: { Replicated: { Replicas: 1 } },
  });
  log(`Service created (${service.id.slice(0, 12)})`);

  // A task can crash-loop almost immediately (e.g. a required env var is missing) — poll its real state for a
  // while before declaring victory, instead of trusting `createService` alone. A single check after a fixed
  // 1.5s wasn't enough for a cold image pull: the task is often still "preparing" (extracting layers) at that
  // point even though it goes on to start fine seconds later, producing a false "failed" status.
  // TODO: 30s is still a fixed guess, not per-image — a genuinely slow-booting app can outlive it and get
  // marked "failed" even though it was going to come up fine. Confirmed for real, not assumed, against these
  // marketplace templates under normal (non-overloaded) conditions: stirling-pdf (Java + LibreOffice + Xvfb),
  // pocket-id. Worth becoming adaptive (e.g. keep polling as long as the task state is still progressing —
  // "preparing"/"starting" — instead of a hard wall-clock cutoff) rather than raising the fixed number, which
  // would just move the same problem to a different, still-arbitrary, slow app.
  const deployTimeoutAt = Date.now() + 30_000;
  let task: Awaited<ReturnType<typeof docker.listTasks>>[number] | undefined;
  do {
    const tasks = await docker.listTasks({ filters: { service: [serviceName] } });
    task = tasks.find((t) => t.Status?.State === "running") ?? tasks[0];
    if (task?.Status?.State === "running") break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  } while (Date.now() < deployTimeoutAt);
  if (task?.Status?.State !== "running") {
    const crashContainerId = task?.Status?.ContainerStatus?.ContainerID as string | undefined;
    const crashLogs = crashContainerId ? await docker.getContainer(crashContainerId).logs({ stdout: true, stderr: true, tail: 100 }) : undefined;
    log(`Task did not reach running state (${task?.Status?.State ?? "unknown"}): ${task?.Status?.Err ?? task?.Status?.Message ?? ""}`);
    if (crashLogs) log(crashLogs.toString("utf-8").trimEnd());
    await db
      .update(deployment)
      .set({ status: "failed", imageTag, containerId: service.id, logs: logs.join("\n"), updatedAt: new Date() })
      .where(eq(deployment.id, deploymentId));
    finishBuildLog(deploymentId);
    return;
  }

  await db
    .update(deployment)
    .set({ status: "stopped", updatedAt: new Date() })
    .where(and(eq(deployment.applicationId, app.id), eq(deployment.status, "running")));

  // deployment.containerId now holds the Swarm service ID, not a container ID — resolveContainerId() below
  // resolves the task's real container on demand, for the handful of operations (logs/stats/exec) the Docker
  // API only exposes at the container level.
  await db
    .update(deployment)
    .set({ status: "running", imageTag, containerId: service.id, logs: logs.join("\n"), updatedAt: new Date() })
    .where(eq(deployment.id, deploymentId));
  finishBuildLog(deploymentId);
}

// Traefik reads routing labels straight off the service, but the Docker API only exposes logs/stats/exec at the
// container level — same gap Dokploy resolves the same way, by filtering listContainers() for the task's
// container instead of trying to talk to the service directly.
export async function resolveContainerId(serviceId: string): Promise<string | null> {
  const containers = await docker.listContainers({ filters: { label: [`com.docker.swarm.service.id=${serviceId}`] } });
  return containers[0]?.Id ?? null;
}

// Every task Swarm has ever scheduled for this service, newest first — including ones stopped by a restart
// (force-update creates a new task but keeps the old one, and its container, around for a while). This is what
// makes it possible to still read a previous container's logs after a restart, not just the current one.
export async function listServiceTasks(serviceId: string) {
  const tasks = await docker.listTasks({ filters: { service: [serviceId] } });
  return tasks
    .map((t) => ({
      taskId: t.ID as string,
      containerId: (t.Status?.ContainerStatus?.ContainerID as string | undefined) ?? null,
      state: t.Status?.State as string,
      message: (t.Status?.Message as string | undefined) ?? null,
      err: (t.Status?.Err as string | undefined) ?? null,
      createdAt: t.CreatedAt as string,
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function restartDeployment(applicationId: string) {
  const dep = await latestDeployment(applicationId);
  if (!dep?.containerId) return null;
  const service = docker.getService(dep.containerId);
  const info = await service.inspect();
  // Replicas: 1 in case a previous stop() scaled it to zero — restart should always bring it back up, not just
  // force-recreate a task that was never going to be scheduled.
  await service.update({
    version: info.Version.Index,
    ...info.Spec,
    Mode: { Replicated: { Replicas: 1 } },
    TaskTemplate: { ...info.Spec.TaskTemplate, ForceUpdate: (info.Spec.TaskTemplate?.ForceUpdate ?? 0) + 1 },
  });
  await db.update(deployment).set({ status: "running", updatedAt: new Date() }).where(eq(deployment.id, dep.id));
  return dep;
}

export async function stopDeployment(applicationId: string) {
  const dep = await latestDeployment(applicationId);
  if (!dep?.containerId) return null;
  const service = docker.getService(dep.containerId);
  const info = await service.inspect();
  // Swarm services have no "stop" verb — scaling to zero replicas is the native equivalent.
  await service.update({ version: info.Version.Index, ...info.Spec, Mode: { Replicated: { Replicas: 0 } } });
  await db.update(deployment).set({ status: "stopped", updatedAt: new Date() }).where(eq(deployment.id, dep.id));
  return dep;
}

export function latestDeployment(applicationId: string) {
  return db.query.deployment.findFirst({
    where: (fields, { eq }) => eq(fields.applicationId, applicationId),
    orderBy: (fields, { desc }) => [desc(fields.createdAt)],
  });
}

// The registry host is whatever `docker login`/`docker pull` would infer from the image reference itself —
// no separate "registry" field to fill in. A prefix counts as a host only if it looks like one (has a "." or
// ":", or is "localhost"); a bare "org/image" or "image" is Docker Hub, same rule the Docker CLI uses.
export function deriveRegistryServer(image: string): string {
  const firstSegment = image.split("/")[0]!;
  const looksLikeHost = firstSegment.includes(".") || firstSegment.includes(":") || firstSegment === "localhost";
  return looksLikeHost ? firstSegment : "https://index.docker.io/v1/";
}

export async function pullImage(image: string, log: (line: string) => void, auth?: { username: string; password: string }) {
  log(`Pulling ${image}`);
  const authconfig = auth ? { ...auth, serveraddress: deriveRegistryServer(image) } : undefined;
  const stream = await docker.pull(image, authconfig ? { authconfig } : {});
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

    // dockerfilePath is relative to the repo root and may sit inside a subdirectory (e.g. a monorepo example) —
    // the build context follows it there so the Dockerfile's own COPY paths (relative to its own directory) resolve.
    const dockerfilePath = app.dockerfilePath ?? "Dockerfile";
    const context = join(dir, dirname(dockerfilePath));

    const buildCpuLimit = Math.min(cpus().length, Math.max(app.cpuLimit, cpus().length / 2));
    const buildMemoryBytes = Math.min(totalmem(), Math.max(app.memoryLimitMb * 1024 * 1024, totalmem() / 2));

    log(`Building ${imageTag}`);
    const stream = await docker.buildImage(
      { context, src: ["."] },
      { t: imageTag, dockerfile: basename(dockerfilePath), memory: buildMemoryBytes, cpuperiod: 100000, cpuquota: Math.round(buildCpuLimit * 100000) },
    );
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

// Exported for applications.ts/projects.ts — removing by this deterministic name also catches a service
// created by a deploy that's still running (pulling/building) when the app gets deleted mid-deploy.
export async function removeExisting(name: string) {
  try {
    await docker.getService(name).remove();
  } catch {
    // no existing service with this name — nothing to remove
  }
}
