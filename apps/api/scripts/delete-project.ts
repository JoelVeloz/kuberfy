import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { application, project } from "../src/db/schema/app";
import { removeExisting } from "../src/services/deploy";

const { values } = parseArgs({ options: { name: { type: "string" } } });
if (!values.name) {
  console.error("Usage: bun run scripts/delete-project.ts --name <project-name>");
  process.exit(1);
}

const proj = await db.query.project.findFirst({ where: (f, { eq }) => eq(f.name, values.name!) });
if (!proj) {
  console.error(`No project named "${values.name}" found.`);
  process.exit(1);
}

const apps = await db.query.application.findMany({ where: (f, { eq }) => eq(f.projectId, proj.id) });
for (const a of apps) {
  await removeExisting(`kuberfy-${a.id}`);
  console.log(`removed service for ${a.name}`);
}

await db.delete(application).where(eq(application.projectId, proj.id));
await db.delete(project).where(eq(project.id, proj.id));
console.log(`deleted project "${proj.name}" (${proj.id}) and its ${apps.length} applications`);
process.exit(0);
