import { parseArgs } from "node:util";
import { db } from "../src/db";
import { latestDeployment, runDeployment, stopDeployment } from "../src/services/deploy";

const { positionals, values } = parseArgs({ allowPositionals: true, options: { concurrency: { type: "string", default: "6" } } });
const names = positionals;
if (names.length === 0) {
  console.error("Usage: bun run scripts/retry-batch.ts [--concurrency N] <app-name> [app-name...]");
  process.exit(1);
}
const CONCURRENCY = Number(values.concurrency);

const POLL_INTERVAL_MS = 5000;
const PER_APP_TIMEOUT_MS = 10 * 60 * 1000;

async function retryOne(a: { id: string; name: string }) {
  console.log(`deploying ${a.name} (${a.id})`);
  await runDeployment(a.id);

  const deadline = Date.now() + PER_APP_TIMEOUT_MS;
  let outcome = "timed out waiting";
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const dep = await latestDeployment(a.id);
    if (dep?.status === "running" || dep?.status === "failed") {
      outcome = dep.status;
      break;
    }
  }
  if (outcome === "running") await stopDeployment(a.id);
  console.log(`${a.name}: ${outcome}${outcome === "running" ? " (stopped)" : ""}`);
}

const apps = await db.query.application.findMany({ where: (f, { inArray }) => inArray(f.name, names) });
const queue = [...apps];
async function worker() {
  let a: (typeof apps)[number] | undefined;
  while ((a = queue.shift())) await retryOne(a);
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, apps.length) }, worker));

console.log("done");
process.exit(0);
