// A ProjectTemplate is a Project containing several Applications — the same "everything is an Application"
// shape the marketplace itself uses (see ApplicationSpec, which mirrors a marketplace template's fields) — wired
// together by env var references like "${database.host}" or "${database.POSTGRES_PASSWORD}" (the same
// cross-service variable syntax Railway uses). Deploy order isn't the order apps are listed in — like Terraform
// building its resource graph from attribute references instead of file order, topoSort() derives it from these
// same references, so a template's apps can be listed in whatever order reads best. Every deployed app already
// shares the kuberfy-apps-network overlay network, so cross-app references need no new kuberfy capability — just
// correct configuration. Shared by the fullstack CLI scripts (apps/api/scripts/fullstack/) and the project
// marketplace API route, so the two never drift out of sync.
import { eq } from "drizzle-orm";
import { db } from "../db";
import { application, domain, project, volume } from "../db/schema/app";
import { suggestDomainHost } from "../lib/auto-domain";
import { appSizes, defaultAppSize, type AppSizeId } from "../lib/app-sizes";
import { runDeployment } from "./deploy";

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const generateSecret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => ALPHANUMERIC[b % ALPHANUMERIC.length]).join("");

export function resolveSize(size: AppSizeId | undefined) {
  return appSizes.find((s) => s.id === size) ?? defaultAppSize;
}

type Application = typeof application.$inferSelect;

export interface EnvVarSpec {
  key: string;
  // a literal value; a "${appId.host}" / "${appId.ENV_KEY}" reference to another app in the same template
  // (topoSort deploys that app first); or null when secret is true, meaning "generate one".
  default: string | null;
  secret: boolean;
}

export interface ApplicationSpec {
  // unique within the template — becomes the Application's name and how other apps in the template reference it
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
  defaultSize?: AppSizeId;
  exposeDomain?: boolean;
}

export interface ProjectTemplate {
  id: string;
  projectName: string;
  description: string;
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
export function topoSort(apps: ApplicationSpec[]): ApplicationSpec[] {
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

  if (order.length < apps.length) throw new Error("Template has a circular reference between apps.");
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

export async function upsertApp(
  projectId: string,
  spec: ApplicationSpec,
  resolved: Map<string, ResolvedApp>,
  sizeOverride?: AppSizeId,
): Promise<Application> {
  const size = resolveSize(sizeOverride ?? spec.defaultSize);
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
  } else {
    await db
      .update(application)
      .set({ repoUrl, branch: spec.branch ?? "main", buildType, dockerfilePath: spec.dockerfilePath, envVars: JSON.stringify(env), memoryLimitMb: size.memoryLimitMb, cpuLimit: size.cpuLimit })
      .where(eq(application.id, app.id));
  }

  resolved.set(spec.id, { id: app!.id, env });

  if (spec.exposeDomain) {
    const existingDomain = await db.query.domain.findFirst({ where: (f, { eq }) => eq(f.applicationId, app!.id) });
    if (!existingDomain) {
      await db.insert(domain).values({ applicationId: app!.id, host: suggestDomainHost(app!.id, spec.name), port: spec.port, isPrimary: true });
    }
  }

  return app!;
}

// Creates (or reuses) the project and every app in it, in dependency order, then kicks off a deploy for each —
// without waiting for any of them to actually finish coming up. A framework app started before its database has
// finished initializing just retries the connection until it's ready, the same as it would if a person deployed
// the database, waited, and deployed the app by hand — so there's no need to block the request on that here.
export async function deployProjectTemplate(
  template: ProjectTemplate,
  ownerId: string,
  opts?: { projectName?: string; sizeOverrides?: Record<string, AppSizeId> },
): Promise<{ projectId: string; applicationIds: string[] }> {
  const projectName = opts?.projectName?.trim() || template.projectName;
  let proj = await db.query.project.findFirst({ where: (f, { eq }) => eq(f.name, projectName) });
  if (!proj) [proj] = await db.insert(project).values({ name: projectName, ownerId }).returning();

  const resolved = new Map<string, ResolvedApp>();
  const applicationIds: string[] = [];
  for (const spec of topoSort(template.apps)) {
    const app = await upsertApp(proj!.id, spec, resolved, opts?.sizeOverrides?.[spec.id]);
    applicationIds.push(app.id);
    runDeployment(app.id).catch((err) => console.error(`deployProjectTemplate: ${spec.id} failed to start:`, err));
  }

  return { projectId: proj!.id, applicationIds };
}
