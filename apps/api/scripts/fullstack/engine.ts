// Shared engine behind every preset in presets.ts: creates a Project with a database Application and a
// framework Application, wires the framework's env vars to the database's real Swarm service name (every
// deployed app already shares the kuberfy-apps-network overlay network, so this needs no new kuberfy
// capability — just correct configuration), deploys both in order, and adds a real domain for the framework
// app so the result is reachable through Traefik, not just over the internal network.
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { application, domain, project, volume } from "../../src/db/schema/app";
import { suggestDomainHost } from "../../src/lib/auto-domain";
import { latestDeployment, runDeployment } from "../../src/services/deploy";

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const generateSecret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => ALPHANUMERIC[b % ALPHANUMERIC.length]).join("");

export interface DbSpec {
  image: string;
  port: number;
  volumeMountPath: string;
  env: (password: string) => Record<string, string>;
}

export interface AppSpec {
  name: string;
  port: number;
  buildType: "image" | "dockerfile";
  image?: string;
  repoUrl?: string;
  branch?: string;
  dockerfilePath?: string;
  // maps the db's real Swarm service host + the generated password to this framework's own env var names
  env: (dbHost: string, dbPassword: string) => Record<string, string>;
}

export interface Preset {
  projectName: string;
  db: DbSpec;
  app: AppSpec;
}

async function waitFor(applicationId: string, label: string) {
  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const dep = await latestDeployment(applicationId);
    if (dep?.status === "running" || dep?.status === "failed") {
      console.log(`${label}: ${dep.status}`);
      return dep.status;
    }
  }
  console.log(`${label}: timed out`);
  return "timed out";
}

export async function runPreset(preset: Preset) {
  const owner = await db.query.users.findFirst();
  if (!owner) {
    console.error("No user exists to own the project. Create one first with `bun run user:create`.");
    process.exit(1);
  }

  let proj = await db.query.project.findFirst({ where: (f, { eq }) => eq(f.name, preset.projectName) });
  if (!proj) {
    [proj] = await db.insert(project).values({ name: preset.projectName, ownerId: owner.id }).returning();
    console.log(`Created project (${proj!.id})`);
  } else {
    console.log(`Reusing project (${proj.id})`);
  }

  const dbPassword = generateSecret();
  let dbApp = await db.query.application.findFirst({ where: (f, { and, eq }) => and(eq(f.projectId, proj!.id), eq(f.name, "database")) });
  if (!dbApp) {
    [dbApp] = await db
      .insert(application)
      .values({ projectId: proj!.id, name: "database", repoUrl: preset.db.image, branch: "main", buildType: "image", envVars: JSON.stringify(preset.db.env(dbPassword)) })
      .returning();
    const volumeId = crypto.randomUUID();
    await db.insert(volume).values({ id: volumeId, applicationId: dbApp!.id, mountPath: preset.db.volumeMountPath, volumeName: `kuberfy-vol-${volumeId}` });
    console.log(`Created database app (${dbApp!.id})`);
  } else {
    console.log(`Reusing database app (${dbApp.id})`);
  }

  const appEnv = preset.app.env(`kuberfy-${dbApp!.id}`, dbPassword);
  let webApp = await db.query.application.findFirst({ where: (f, { and, eq }) => and(eq(f.projectId, proj!.id), eq(f.name, preset.app.name)) });
  if (!webApp) {
    [webApp] = await db
      .insert(application)
      .values({
        projectId: proj!.id,
        name: preset.app.name,
        repoUrl: preset.app.buildType === "image" ? preset.app.image! : preset.app.repoUrl!,
        branch: preset.app.branch ?? "main",
        buildType: preset.app.buildType,
        dockerfilePath: preset.app.dockerfilePath,
        envVars: JSON.stringify(appEnv),
      })
      .returning();
    console.log(`Created ${preset.app.name} app (${webApp!.id})`);
  } else {
    await db.update(application).set({ envVars: JSON.stringify(appEnv) }).where(eq(application.id, webApp.id));
    console.log(`Reusing ${preset.app.name} app (${webApp.id})`);
  }

  let webDomain = await db.query.domain.findFirst({ where: (f, { eq }) => eq(f.applicationId, webApp!.id) });
  if (!webDomain) {
    [webDomain] = await db.insert(domain).values({ applicationId: webApp!.id, host: suggestDomainHost(webApp!.id, webApp!.name), port: preset.app.port, isPrimary: true }).returning();
    console.log(`Created domain ${webDomain!.host}`);
  } else {
    console.log(`Reusing domain ${webDomain.host}`);
  }

  console.log(`\nDeploying database...`);
  await runDeployment(dbApp!.id);
  const dbStatus = await waitFor(dbApp!.id, "database");
  if (dbStatus !== "running") {
    console.error("Database didn't come up — aborting before deploying the app that depends on it.");
    process.exit(1);
  }

  console.log(`\nDeploying ${preset.app.name}...`);
  await runDeployment(webApp!.id);
  const webStatus = await waitFor(webApp!.id, preset.app.name);

  console.log(`\n${webStatus === "running" ? "✔" : "✖"} Result: database=${dbStatus}, ${preset.app.name}=${webStatus}. Domain: ${webDomain!.host}`);
  process.exit(webStatus === "running" ? 0 : 1);
}
