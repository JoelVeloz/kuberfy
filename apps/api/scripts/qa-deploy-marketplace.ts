// Smoke-tests the marketplace catalog: creates a "QA" project, creates one application per marketplace
// template, triggers a deploy for each, then reports which ones ended up running. Best-effort — one template
// failing must never stop the rest from being attempted.
import { db } from "../src/db";
import { application, project, volume } from "../src/db/schema/app";
import { latestDeployment, runDeployment } from "../src/services/deploy";
import templates from "../src/data/marketplace-templates.json";

const ALPHANUMERIC = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const generateSecret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => ALPHANUMERIC[b % ALPHANUMERIC.length]).join("");

// Required (no default) non-secret vars can't be left blank — plenty of images refuse to start on an empty
// string (flatnotes: "FLATNOTES_USERNAME must be set"). A real user fills these in on the marketplace form;
// this script needs some value of its own, guessed from the key's shape since there's no per-template hint.
function fillRequiredValue(key: string): string {
  if (/DOMAIN|URL/i.test(key)) return "http://localhost";
  if (/EMAIL/i.test(key)) return "qa@kuberfy.test";
  return "kuberfy-qa";
}

const owner = await db.query.users.findFirst();
if (!owner) {
  console.error("No user exists to own the QA project. Create one first with `bun run user:create`.");
  process.exit(1);
}

let qaProject = await db.query.project.findFirst({ where: (fields, { eq }) => eq(fields.name, "QA") });
if (!qaProject) {
  [qaProject] = await db.insert(project).values({ name: "QA", ownerId: owner.id }).returning();
  console.log(`Created project "QA" (${qaProject!.id})`);
} else {
  console.log(`Reusing existing project "QA" (${qaProject.id})`);
}

const existing = await db.query.application.findMany({ where: (fields, { eq }) => eq(fields.projectId, qaProject!.id) });
const existingByName = new Map(existing.map((a) => [a.name, a]));

const created: { id: string; name: string }[] = [];
for (const t of templates) {
  const existingApp = existingByName.get(t.id);
  if (existingApp) {
    created.push({ id: existingApp.id, name: t.name });
    continue;
  }

  const isDockerfile = t.image == null;
  const envVars = Object.fromEntries(t.envVars.map((v) => [v.key, v.secret ? generateSecret() : (v.default ?? fillRequiredValue(v.key))]));

  const [app] = await db
    .insert(application)
    .values({
      projectId: qaProject!.id,
      name: t.id,
      repoUrl: isDockerfile ? t.repoUrl! : t.image!,
      branch: isDockerfile ? (t.branch ?? "main") : "main",
      buildType: isDockerfile ? "dockerfile" : "image",
      dockerfilePath: isDockerfile ? t.dockerfilePath : null,
      envVars: Object.keys(envVars).length > 0 ? JSON.stringify(envVars) : null,
    })
    .returning();
  for (const mountPath of t.volumes) {
    const volumeId = crypto.randomUUID();
    await db.insert(volume).values({ id: volumeId, applicationId: app!.id, mountPath, volumeName: `kuberfy-vol-${volumeId}` });
  }

  created.push({ id: app!.id, name: t.name });
  console.log(`Created application "${t.name}" (${app!.id})`);
}

console.log(`\nDeploying ${created.length} applications...`);
for (const app of created) {
  try {
    await runDeployment(app.id);
  } catch (err) {
    console.error(`Failed to trigger deploy for ${app.name}:`, err instanceof Error ? err.message : err);
  }
}

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000;
const pending = new Set(created.map((a) => a.id));
const results = new Map<string, string>();
const deadline = Date.now() + POLL_TIMEOUT_MS;

while (pending.size > 0 && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  for (const id of [...pending]) {
    const dep = await latestDeployment(id);
    if (dep?.status === "running" || dep?.status === "failed") {
      results.set(id, dep.status);
      pending.delete(id);
    }
  }
}
for (const id of pending) results.set(id, "timed out (still building)");

console.log("\n=== QA marketplace deploy report ===");
for (const app of created) console.log(`${results.get(app.id) === "running" ? "✔" : "✖"} ${app.name}: ${results.get(app.id)}`);

const failCount = [...results.values()].filter((s) => s !== "running").length;
console.log(`\n${created.length - failCount}/${created.length} running.`);
process.exit(0);
