import { closeSync, openSync, statSync, unlinkSync } from "node:fs";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { env } from "../lib/env";
import { db } from "./index";

// Dockerfile's CMD runs `migrate` on every container boot, unguarded, against the same persistent database file —
// a Swarm rolling update (or two update triggers close together) can briefly run two containers at once, both
// racing to run migrations concurrently. A destructive migration (SQLite's "recreate the table" pattern, used for
// any schema change it can't ALTER directly) isn't safe under that race: one process can drop/rename a table out
// from under the other mid-migration. This lock file — on the same persistent volume as the database itself, so
// it's visible to every instance regardless of which container holds it — makes sure only one instance actually
// runs migrate() at a time; a second instance just waits for the first to finish, then finds nothing left to do.
const LOCK_PATH = `${env.DATABASE_PATH}.migrate.lock`;
const STALE_LOCK_MS = 5 * 60 * 1000;
const RETRY_MS = 500;
const MAX_WAIT_MS = 2 * 60 * 1000;

async function withMigrationLock(fn: () => void) {
  const deadline = Date.now() + MAX_WAIT_MS;
  while (true) {
    try {
      closeSync(openSync(LOCK_PATH, "wx"));
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      if (Date.now() - statSync(LOCK_PATH).mtimeMs > STALE_LOCK_MS) {
        unlinkSync(LOCK_PATH);
        continue;
      }
      if (Date.now() > deadline) throw new Error(`Timed out waiting for another instance's migration lock (${LOCK_PATH}).`);
      await new Promise((r) => setTimeout(r, RETRY_MS));
    }
  }
  try {
    fn();
  } finally {
    unlinkSync(LOCK_PATH);
  }
}

await withMigrationLock(() => migrate(db, { migrationsFolder: "./drizzle" }));

console.log("Migrations applied");
