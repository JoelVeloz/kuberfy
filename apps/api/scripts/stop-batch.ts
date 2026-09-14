import { parseArgs } from "node:util";
import { db } from "../src/db";
import { stopDeployment } from "../src/services/deploy";

const { positionals } = parseArgs({ allowPositionals: true });
const names = positionals;
if (names.length === 0) {
  console.error("Usage: bun run scripts/stop-batch.ts <app-name> [app-name...]");
  process.exit(1);
}

const apps = await db.query.application.findMany({ where: (f, { inArray }) => inArray(f.name, names) });
for (const a of apps) {
  try {
    await stopDeployment(a.id);
    console.log(`stopped ${a.name}`);
  } catch (err) {
    console.error(`failed to stop ${a.name}:`, err instanceof Error ? err.message : err);
  }
}
console.log("done");
process.exit(0);
