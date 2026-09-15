// Shared engine behind every preset in presets.ts. A Preset is just a Project containing several Applications —
// the same "everything is an Application" shape the marketplace itself uses (see ApplicationSpec below, which
// mirrors a marketplace template's fields) — wired together by env var references like "${database.host}" or
// "${database.POSTGRES_PASSWORD}" (the same cross-service variable syntax Railway uses). Deploy order isn't the
// order apps are listed in — like Terraform building its resource graph from attribute references instead of
// file order, topoSort() below derives it from these same references, so a preset's apps can be listed in
// whatever order reads best. Every deployed app already shares the kuberfy-apps-network overlay network, so
// cross-app references need no new kuberfy capability — just correct configuration.
import { eq } from "drizzle-orm";
import { db } from "../../src/db";
import { application, domain, project, volume } from "../../src/db/schema/app";
import { suggestDomainHost } from "../../src/lib/auto-domain";
import { appSizes, defaultAppSize, type AppSizeId } from "../../src/lib/app-sizes";
import { docker, latestDeployment, parseDockerStats, resolveContainerId, runDeployment, type DockerStatsSample } from "../../src/services/deploy";

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const generateSecret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => ALPHANUMERIC[b % ALPHANUMERIC.length]).join("");

function resolveSize(size: AppSizeId | undefined) {
  return appSizes.find((s) => s.id === size) ?? defaultAppSize;
}

type Application = typeof application.$inferSelect;

export interface EnvVarSpec {
  key: string;
  // a literal value; a "${appId.host}" / "${appId.ENV_KEY}" reference to another app in the same preset
  // (topoSort below deploys that app first); or null when secret is true, meaning "generate one".
  default: string | null;
  secret: boolean;
}

export interface ApplicationSpec {
  // unique within the preset — becomes the Application's name and how other apps in the preset reference it
  id: string;
  name: string;
  port: number;
  // exactly like the marketplace's own template shape: an image pulls straight from a registry, or null means
  // build from repoUrl/branch/dockerfilePath instead
  image: string | null;
  repoUrl?: string;
  branch?: string;
  dockerfilePath?: string;
  volumes?: string[];
  envVars: EnvVarSpec[];
  size?: AppSizeId;
  exposeDomain?: boolean;
}

export interface Preset {
  projectName: string;
  apps: ApplicationSpec[];
}

function referencedAppIds(spec: ApplicationSpec): string[] {
  const ids = new Set<string>();
  for (const v of spec.envVars) {
    for (const match of v.default?.matchAll(/\$\{([\w-]+)\.\w+\}/g) ?? []) ids.add(match[1]);
  }
  return [...ids];
}

// Deploy order derived from the dependency graph the ${appId.field} references form, not from array position —
// each app comes after every app it references. Kahn's algorithm; throws on a reference cycle or an unknown id.
function topoSort(apps: ApplicationSpec[]): ApplicationSpec[] {
  const byId = new Map(apps.map((a) => [a.id, a]));
  const dependencyCounts = new Map(apps.map((a) => [a.id, 0]));
  const dependents = new Map<string, string[]>(apps.map((a) => [a.id, []]));

  for (const spec of apps) {
    for (const refId of referencedAppIds(spec)) {
      if (!byId.has(refId)) throw new Error(`"${spec.id}" references unknown app "${refId}".`);
      dependencyCounts.set(spec.id, dependencyCounts.get(spec.id)! + 1);
      dependents.get(refId)!.push(spec.id);
    }
  }

  const ready = apps.filter((a) => dependencyCounts.get(a.id) === 0).map((a) => a.id);
  const order: ApplicationSpec[] = [];
  while (ready.length) {
    const id = ready.shift()!;
    order.push(byId.get(id)!);
    for (const dependentId of dependents.get(id)!) {
      const remaining = dependencyCounts.get(dependentId)! - 1;
      dependencyCounts.set(dependentId, remaining);
      if (remaining === 0) ready.push(dependentId);
    }
  }

  if (order.length < apps.length) throw new Error("Preset has a circular reference between apps.");
  return order;
}

interface ResolvedApp {
  id: string;
  env: Record<string, string>;
}

function resolveRef(raw: string, resolved: Map<string, ResolvedApp>): string {
  return raw.replace(/\$\{([\w-]+)\.(\w+)\}/g, (_match, refId: string, field: string) => {
    const ref = resolved.get(refId);
    if (!ref) throw new Error(`"${refId}" was not deployed before its dependent — topoSort() should have prevented this.`);
    if (field === "host") return `kuberfy-${ref.id}`;
    if (!(field in ref.env)) throw new Error(`App "${refId}" has no env var "${field}" to reference.`);
    return ref.env[field];
  });
}

function buildEnv(spec: ApplicationSpec, existing: Record<string, string> | null, resolved: Map<string, ResolvedApp>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const v of spec.envVars) {
    if (v.secret && existing?.[v.key]) {
      env[v.key] = existing[v.key];
    } else if (v.secret) {
      env[v.key] = generateSecret();
    } else if (v.default?.includes("${")) {
      env[v.key] = resolveRef(v.default, resolved);
    } else {
      env[v.key] = v.default ?? "";
    }
  }
  return env;
}

interface DeployResult {
  label: string;
  applicationId: string;
  status: string;
  sizeLabel: string;
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

async function upsertApp(projectId: string, spec: ApplicationSpec, resolved: Map<string, ResolvedApp>): Promise<Application> {
  const size = resolveSize(spec.size);
  let app = await db.query.application.findFirst({ where: (f, { and, eq }) => and(eq(f.projectId, projectId), eq(f.name, spec.id)) });
  const existingEnv = app ? (JSON.parse(app.envVars ?? "{}") as Record<string, string>) : null;
  const env = buildEnv(spec, existingEnv, resolved);
  const repoUrl = spec.image ?? spec.repoUrl!;
  const buildType = spec.image ? "image" : "dockerfile";

  if (!app) {
    [app] = await db
      .insert(application)
      .values({
        projectId,
        name: spec.id,
        repoUrl,
        branch: spec.branch ?? "main",
        buildType,
        dockerfilePath: spec.dockerfilePath,
        envVars: JSON.stringify(env),
        memoryLimitMb: size.memoryLimitMb,
        cpuLimit: size.cpuLimit,
      })
      .returning();
    for (const mountPath of spec.volumes ?? []) {
      const volumeId = crypto.randomUUID();
      await db.insert(volume).values({ id: volumeId, applicationId: app!.id, mountPath, volumeName: `kuberfy-vol-${volumeId}` });
    }
    console.log(`Created ${spec.id} (${app!.id}, ${size.label})`);
  } else {
    await db
      .update(application)
      .set({ repoUrl, branch: spec.branch ?? "main", buildType, dockerfilePath: spec.dockerfilePath, envVars: JSON.stringify(env), memoryLimitMb: size.memoryLimitMb, cpuLimit: size.cpuLimit })
      .where(eq(application.id, app.id));
    console.log(`Reusing ${spec.id} (${app.id}, ${size.label})`);
  }

  resolved.set(spec.id, { id: app!.id, env });

  if (spec.exposeDomain) {
    const existingDomain = await db.query.domain.findFirst({ where: (f, { eq }) => eq(f.applicationId, app!.id) });
    if (!existingDomain) {
      const [created] = await db.insert(domain).values({ applicationId: app!.id, host: suggestDomainHost(app!.id, spec.name), port: spec.port, isPrimary: true }).returning();
      console.log(`Created domain ${created!.host}`);
    } else {
      console.log(`Reusing domain ${existingDomain.host}`);
    }
  }

  return app!;
}

async function reportSizes(results: DeployResult[]) {
  console.log(`\n${"Name".padEnd(16)}${"Status".padEnd(10)}${"Size".padEnd(10)}${"Mem used / limit".padEnd(20)}Note`);
  for (const r of results) {
    let memNote = "—";
    let flag = "";
    if (r.status === "running") {
      const dep = await latestDeployment(r.applicationId);
      const containerId = dep?.containerId ? await resolveContainerId(dep.containerId) : null;
      if (containerId) {
        const raw = (await docker.getContainer(containerId).stats({ stream: false })) as unknown as DockerStatsSample;
        const stats = parseDockerStats(raw);
        const usedMb = Math.round(stats.memUsed / 1024 / 1024);
        const limitMb = Math.round(stats.memLimit / 1024 / 1024);
        memNote = `${usedMb}MB / ${limitMb}MB`;
        if (limitMb > 0 && usedMb / limitMb > 0.85) flag = "near limit — consider a bigger size";
      }
    }
    console.log(`${r.label.padEnd(16)}${r.status.padEnd(10)}${r.sizeLabel.padEnd(10)}${memNote.padEnd(20)}${flag}`);
  }
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

  const resolved = new Map<string, ResolvedApp>();
  const results: DeployResult[] = [];

  for (const spec of topoSort(preset.apps)) {
    const app = await upsertApp(proj!.id, spec, resolved);
    console.log(`\nDeploying ${spec.id}...`);
    await runDeployment(app.id);
    const status = await waitFor(app.id, spec.id);
    results.push({ label: spec.id, applicationId: app.id, status, sizeLabel: resolveSize(spec.size).label });
  }

  await reportSizes(results);

  const allRunning = results.every((r) => r.status === "running");
  console.log(`\n${allRunning ? "✔" : "✖"} ${results.map((r) => `${r.label}=${r.status}`).join(", ")}`);
  process.exit(allRunning ? 0 : 1);
}
