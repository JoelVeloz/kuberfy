import { db } from "../db";
import { env } from "../lib/env";

const TELEMETRY_URL = "https://kuberfy-telemetry.app-ellyflow.workers.dev/v1/heartbeat";
const HEARTBEAT_INTERVAL_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

const bootedAt = Date.now();

async function sendHeartbeat() {
  const instance = await db.query.setting.findFirst();
  if (!instance) return;
  await fetch(TELEMETRY_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      instanceId: instance.id,
      version: env.KUBERFY_VERSION,
      installedAt: instance.createdAt.getTime(),
      bootedAt,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

export function startTelemetry() {
  if (env.KUBERFY_VERSION === "dev" || env.KUBERFY_TELEMETRY_DISABLED) return;
  const beat = () => sendHeartbeat().catch(() => {});
  beat();
  setInterval(beat, HEARTBEAT_INTERVAL_MS);
}
