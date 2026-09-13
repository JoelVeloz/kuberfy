import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Docker from "dockerode";
import { eq } from "drizzle-orm";
import simpleGit from "simple-git";
import { db } from "../db";
import { application, deployment } from "../db/schema/app";

const docker = new Docker();

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

  log(`Creating container ${containerName} from ${imageTag}`);
  const container = await docker.createContainer({
    name: containerName,
    Image: imageTag,
    Labels: { "kuberfy.application": app.id },
    HostConfig: { RestartPolicy: { Name: "unless-stopped" } },
  });
  await container.start();
  log(`Started container ${container.id}`);

  await db
    .update(deployment)
    .set({ status: "running", imageTag, containerId: container.id, logs: logs.join("\n"), updatedAt: new Date() })
    .where(eq(deployment.id, deploymentId));
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
