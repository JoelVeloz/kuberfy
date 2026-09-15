// CLI-only orchestration around the shared project-template engine (apps/api/src/services/project-templates.ts):
// deploys every app in a preset in dependency order, waits for each to actually come up (not just "started"),
// and prints a per-app resource-usage report — the same report the project marketplace's post-deploy check could
// use, but here run synchronously so a person watching the terminal sees the real outcome before the process exits.
import { db } from "../../src/db";
import { docker, latestDeployment, parseDockerStats, resolveContainerId, runDeployment, type DockerStatsSample } from "../../src/services/deploy";
import { resolveSize, topoSort, upsertApp, type ProjectTemplate } from "../../src/services/project-templates";
import { project } from "../../src/db/schema/app";

export { generateSecret } from "../../src/services/project-templates";
export type { ApplicationSpec, ProjectTemplate as Preset } from "../../src/services/project-templates";

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

export async function runPreset(preset: ProjectTemplate) {
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

  const resolved = new Map<string, { id: string; env: Record<string, string> }>();
  const results: DeployResult[] = [];

  for (const spec of topoSort(preset.apps)) {
    const app = await upsertApp(proj!.id, spec, resolved);
    console.log(`Upserted ${spec.id} (${app.id}, ${resolveSize(spec.defaultSize).label})`);
    console.log(`\nDeploying ${spec.id}...`);
    await runDeployment(app.id);
    const status = await waitFor(app.id, spec.id);
    results.push({ label: spec.id, applicationId: app.id, status, sizeLabel: resolveSize(spec.defaultSize).label });
  }

  await reportSizes(results);

  const allRunning = results.every((r) => r.status === "running");
  console.log(`\n${allRunning ? "✔" : "✖"} ${results.map((r) => `${r.label}=${r.status}`).join(", ")}`);
  process.exit(allRunning ? 0 : 1);
}
