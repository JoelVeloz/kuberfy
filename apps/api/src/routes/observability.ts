import { PassThrough } from "node:stream";
import { Hono } from "hono";
import { upgradeWebSocket } from "hono/bun";
import { gte, lt } from "drizzle-orm";
import { db } from "../db";
import { requestLog } from "../db/schema/app";
import { docker } from "../services/deploy";
import { requireAuth } from "../lib/auth-middleware";

export const observability = new Hono();

observability.use("*", requireAuth);

// Ranges the Traffic page's timeline supports — each covers the FULL period with fixed-size buckets (empty ones
// included), so "24h" always shows 24 hourly slots and "7d" always shows 7 daily slots, whether or not there was
// traffic in every one. Kept here so the /history response and the WS-fed live view use identical bucketing.
export const TRAFFIC_RANGES = {
  "1h": { ms: 60 * 60_000, bucketMs: 60_000, buckets: 60 },
  "24h": { ms: 24 * 60 * 60_000, bucketMs: 60 * 60_000, buckets: 24 },
  "7d": { ms: 7 * 24 * 60 * 60_000, bucketMs: 24 * 60 * 60_000, buckets: 7 },
  "30d": { ms: 30 * 24 * 60 * 60_000, bucketMs: 24 * 60 * 60_000, buckets: 30 },
} as const;
export type TrafficRange = keyof typeof TRAFFIC_RANGES;

const RETENTION_MS = 30 * 24 * 60 * 60_000;

// Traefik's own JSON access log (see docker-compose.yml / install.sh's `--accesslog.format=json`) is the whole
// pipeline here — one line per request, already carrying which router/service handled it, method, host, path,
// status and duration. No new infra (Prometheus/Loki) needed; the container is found by image rather than a
// fixed name since dev, docker-compose, and install.sh's Swarm setup each name it differently.
interface TrafficEvent {
  time: string;
  method: string;
  host: string;
  path: string;
  status: number;
  durationMs: number;
  service: string | null;
}

function parseAccessLogLine(line: string): TrafficEvent | null {
  try {
    const raw = JSON.parse(line) as Record<string, unknown>;
    if (typeof raw.RequestMethod !== "string" || typeof raw.RequestHost !== "string") return null;
    return {
      time: typeof raw.StartUTC === "string" ? raw.StartUTC : new Date().toISOString(),
      method: raw.RequestMethod,
      host: raw.RequestHost,
      path: typeof raw.RequestPath === "string" ? raw.RequestPath : "/",
      status: typeof raw.DownstreamStatus === "number" ? raw.DownstreamStatus : 0,
      durationMs: typeof raw.Duration === "number" ? Math.round(raw.Duration / 1e6) : 0,
      service: typeof raw.ServiceName === "string" ? raw.ServiceName : null,
    };
  } catch {
    return null;
  }
}

async function findTraefikContainerId(): Promise<string | null> {
  // Docker's `ancestor` filter needs an exact image:tag match, so it's checked here instead (tag-agnostic, but
  // exact on the repo name — a deployed `traefik/whoami` fixture also starts with "traefik" and must not match).
  // Scoped to kuberfy-apps-network specifically, since docker-compose.dev.yml's dev-only Traefik (fronting
  // astro/bun, not deployed apps) also runs the same image and would otherwise be picked instead.
  const containers = await docker.listContainers();
  const match = containers.find((c) => c.Image.split(":")[0] === "traefik" && "kuberfy-apps-network" in (c.NetworkSettings?.Networks ?? {}));
  return match?.Id ?? null;
}

observability.get(
  "/traffic",
  upgradeWebSocket(() => {
    type LogStream = { destroy(): void };
    let stream: LogStream | null = null;
    return {
      onOpen: async (_evt, ws) => {
        const containerId = await findTraefikContainerId();
        if (!containerId) {
          ws.send(JSON.stringify({ error: "No Traefik container found — is the proxy running?" }));
          ws.close();
          return;
        }
        // Traefik's container isn't given a TTY, so `logs()` returns Docker's multiplexed stdout/stderr framing —
        // has to be demuxed (unlike deploy.ts's app containers, which run with Tty:true and skip this entirely).
        const logStream = (await docker.getContainer(containerId).logs({ follow: true, stdout: true, stderr: false, tail: 200 })) as unknown as LogStream;
        stream = logStream;
        const stdout = new PassThrough();
        docker.modem.demuxStream(logStream, stdout, new PassThrough());
        let buffered = "";
        stdout.on("data", (chunk: Buffer) => {
          buffered += chunk.toString("utf-8");
          let newlineIndex: number;
          while ((newlineIndex = buffered.indexOf("\n")) !== -1) {
            const line = buffered.slice(0, newlineIndex);
            buffered = buffered.slice(newlineIndex + 1);
            const event = parseAccessLogLine(line);
            if (!event) continue;
            ws.send(JSON.stringify(event));
            db.insert(requestLog)
              .values({ time: new Date(event.time), method: event.method, host: event.host, path: event.path, status: event.status, durationMs: event.durationMs, service: event.service })
              .catch(() => {});
            // No cron for this — pruning piggybacks on ~1% of inserts instead, cheap enough for a hobby-scale log.
            if (Math.random() < 0.01) db.delete(requestLog).where(lt(requestLog.time, new Date(Date.now() - RETENTION_MS))).catch(() => {});
          }
        });
      },
      onClose: () => stream?.destroy(),
    };
  }),
);

observability.get("/traffic/history", async (c) => {
  const range = (c.req.query("range") ?? "24h") as TrafficRange;
  const config = TRAFFIC_RANGES[range];
  if (!config) return c.json({ error: "Invalid range" }, 400);

  const rows = await db.query.requestLog.findMany({
    where: gte(requestLog.time, new Date(Date.now() - config.ms)),
    orderBy: (fields, { asc }) => [asc(fields.time)],
  });
  const events: TrafficEvent[] = rows.map((r) => ({
    time: r.time.toISOString(),
    method: r.method,
    host: r.host,
    path: r.path,
    status: r.status,
    durationMs: r.durationMs,
    service: r.service,
  }));
  return c.json({ range, buckets: config.buckets, bucketMs: config.bucketMs, events });
});
