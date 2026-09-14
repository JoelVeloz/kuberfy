import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { application } from "../src/db/schema/app";
import { removeExisting } from "../src/services/deploy";

const { positionals } = parseArgs({ allowPositionals: true });
const names = positionals;
if (names.length === 0) {
  console.error("Usage: bun run scripts/delete-app.ts <app-name> [app-name...]");
  process.exit(1);
}

const apps = await db.query.application.findMany({ where: (f, { inArray }) => inArray(f.name, names) });
for (const a of apps) {
  await removeExisting(`kuberfy-${a.id}`);
  await db.delete(application).where(eq(application.id, a.id));
  console.log(`deleted ${a.name}`);
}
console.log("done");
process.exit(0);
