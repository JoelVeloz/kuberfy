import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Docker from "dockerode";
import { and, eq } from "drizzle-orm";
import simpleGit from "simple-git";
import { db } from "../db";
import { application, deployment, domain } from "../db/schema/app";

export const docker = new Docker();
const DEPLOY_NETWORK = "kuberfy-network";

export async function runDeployment(applicationId: string) {
  const app = await db.query.application.findFirst({ where: eq(application.id, applicationId) });
  if (!app) return null;

  const [dep] = await db.insert(deployment).values({ applicationId, status: "building" }).returning();

  deploy(app, dep!.id).catch(async (err) => {
    await db
      .update(deployment)
      .set({ status: "failed", logs: err instanceof Error ? err.message : String(err), updatedAt: new Date() })
      .where(eq(deployment.id, dep!.id));
  });

  return dep!;
}

async function deploy(app: typeof application.$inferSelect, deploymentId: string) {
  const logs: string[] = [];
  const log = (line: string) => logs.push(line);

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
  if (domains.length > 0 && app.port) {
    const rule = domains.map((d) => `Host(\`${d.host}\`)`).join(" || ");
    labels["traefik.enable"] = "true";
    labels[`traefik.http.routers.${app.id}.rule`] = rule;
    labels[`traefik.http.routers.${app.id}.entrypoints`] = "web";
    labels[`traefik.http.services.${app.id}.loadbalancer.server.port`] = String(app.port);
    log(`Routing ${domains.map((d) => d.host).join(", ")} → internal port ${app.port} via Traefik`);
  }

  const env = app.envVars ? Object.entries(JSON.parse(app.envVars) as Record<string, string>).map(([k, v]) => `${k}=${v}`) : undefined;

  log(`Creating container ${containerName} from ${imageTag}`);
  const container = await docker.createContainer({
    name: containerName,
    Image: imageTag,
    Tty: true,
    Env: env,
    Labels: labels,
    HostConfig: { RestartPolicy: { Name: "unless-stopped" }, NetworkMode: DEPLOY_NETWORK },
  });
  await container.start();
  log(`Started container ${container.id} on network ${DEPLOY_NETWORK} — no ports published to the host`);

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
