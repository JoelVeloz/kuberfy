import { db } from "../db";
import { env } from "../lib/env";

const TELEMETRY_URL = "https://kuberfy-telemetry.app-ellyflow.workers.dev/v1/heartbeat";
const DEFAULT_INTERVAL_MS = 5 * 60_000;
const MIN_INTERVAL_MS = 60_000;
const MAX_INTERVAL_MS = 24 * 60 * 60_000;
const REQUEST_TIMEOUT_MS = 10_000;

const bootedAt = Date.now();

const clampInterval = (ms: unknown) =>
  typeof ms === "number" && Number.isFinite(ms) ? Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, ms)) : DEFAULT_INTERVAL_MS;

async function sendHeartbeat(): Promise<number> {
  const instance = await db.query.setting.findFirst();
  if (!instance) return DEFAULT_INTERVAL_MS;
  const response = await fetch(TELEMETRY_URL, {
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
  const body = (await response.json().catch(() => null)) as { nextHeartbeatMs?: unknown } | null;
  return clampInterval(body?.nextHeartbeatMs);
}

export function startTelemetry() {
  if (env.KUBERFY_VERSION === "dev" || env.KUBERFY_TELEMETRY_DISABLED) return;
  const beat = async () => {
    const nextMs = await sendHeartbeat().catch(() => DEFAULT_INTERVAL_MS);
    setTimeout(beat, nextMs);
  };
  void beat();
}
