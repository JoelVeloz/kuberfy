import { PassThrough } from "node:stream";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { upgradeWebSocket } from "hono/bun";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { application, requestLog } from "../db/schema/app";
import { docker } from "../services/deploy";
import { requireAuth } from "../lib/auth-middleware";
import { paginationOffset, paginationQuery } from "../lib/pagination";

export const observability = new Hono();

observability.use("*", requireAuth);

export const TRAFFIC_RANGES = {
  "1h": { ms: 60 * 60_000, bucketMs: 60_000, buckets: 60 },
  "24h": { ms: 24 * 60 * 60_000, bucketMs: 60 * 60_000, buckets: 24 },
  "7d": { ms: 7 * 24 * 60 * 60_000, bucketMs: 24 * 60 * 60_000, buckets: 7 },
  "30d": { ms: 30 * 24 * 60 * 60_000, bucketMs: 24 * 60 * 60_000, buckets: 30 },
} as const;
export type TrafficRange = keyof typeof TRAFFIC_RANGES;

const RETENTION_MS = 30 * 24 * 60 * 60_000;

interface TrafficEvent {
  time: string;
  method: string;
  host: string;
  path: string;
  status: number;
  durationMs: number;
  service: string | null;
  clientIp: string | null;
  userAgent: string | null;
  protocol: string | null;
  originStatus: number | null;
  requestContentSize: number | null;
  downstreamContentSize: number | null;
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
      clientIp: typeof raw.ClientHost === "string" ? raw.ClientHost : null,
      userAgent: typeof raw["request_User-Agent"] === "string" ? raw["request_User-Agent"] : null,
      protocol: typeof raw.RequestProtocol === "string" ? raw.RequestProtocol : null,
      originStatus: typeof raw.OriginStatus === "number" ? raw.OriginStatus : null,
      requestContentSize: typeof raw.RequestContentSize === "number" ? raw.RequestContentSize : null,
      downstreamContentSize: typeof raw.DownstreamContentSize === "number" ? raw.DownstreamContentSize : null,
    };
  } catch {
    return null;
  }
}

async function findTraefikContainerId(): Promise<string | null> {
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
              .values({
                time: new Date(event.time),
                method: event.method,
                host: event.host,
                path: event.path,
                status: event.status,
                durationMs: event.durationMs,
                service: event.service,
                clientIp: event.clientIp,
                userAgent: event.userAgent,
                protocol: event.protocol,
                originStatus: event.originStatus,
                requestContentSize: event.requestContentSize,
                downstreamContentSize: event.downstreamContentSize,
              })
              .catch(() => {});
            if (Math.random() < 0.01)
              db.delete(requestLog)
                .where(lt(requestLog.time, new Date(Date.now() - RETENTION_MS)))
                .catch(() => {});
          }
        });
      },
      onClose: () => stream?.destroy(),
    };
  }),
);

// Chart data: counts per bucket, computed in SQL — the table can hold months of rows, but this response always
// stays small (at most `buckets` rows), regardless of how much traffic the range actually covers.
observability.get("/traffic/summary", async (c) => {
  const range = (c.req.query("range") ?? "24h") as TrafficRange;
  const host = c.req.query("host");
  const config = TRAFFIC_RANGES[range];
  if (!config) return c.json({ error: "Invalid range" }, 400);

  const bucketSec = Math.floor(config.bucketMs / 1000);
  const since = new Date(Date.now() - config.ms);
  // `requestLog.time` is stored as unix epoch seconds — this buckets rows by dividing/re-multiplying by the
  // bucket width (integer division truncates), the same trick `date_trunc` does for other databases.
  const bucketExpr = sql<number>`(${requestLog.time} / ${bucketSec}) * ${bucketSec}`;

  const rows = await db
    .select({
      bucket: bucketExpr,
      good: sql<number>`sum(case when ${requestLog.status} < 400 then 1 else 0 end)`,
      warning: sql<number>`sum(case when ${requestLog.status} >= 400 and ${requestLog.status} < 500 then 1 else 0 end)`,
      critical: sql<number>`sum(case when ${requestLog.status} >= 500 then 1 else 0 end)`,
    })
    .from(requestLog)
    .where(and(gte(requestLog.time, since), host ? eq(requestLog.host, host) : undefined))
    .groupBy(bucketExpr);

  const counts = rows.map((r) => ({ bucketStart: r.bucket * 1000, good: r.good, warning: r.warning, critical: r.critical }));
  return c.json({ range, buckets: config.buckets, bucketMs: config.bucketMs, counts });
});

// deploy.ts names each domain's Traefik router/service "<applicationId>-<domainId>" (see the loop in deploy()) —
// Traefik's own access log reports it back as "<applicationId>-<domainId>@docker", never the app's real name. This
// pulls the UUID prefix back out so the traffic filter can show something a human recognizes instead of that.
const APP_ID_PREFIX = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})-/i;

// Every distinct host seen in the range, paired with the application that owns it — feeds the "All domains"
// filter (labelled "host (app name)") without shipping the raw rows themselves.
observability.get("/traffic/hosts", async (c) => {
  const range = (c.req.query("range") ?? "24h") as TrafficRange;
  const config = TRAFFIC_RANGES[range];
  if (!config) return c.json({ error: "Invalid range" }, 400);

  // SQLite-specific: when a query has an aggregate (max(time) here), a bare column pulls its value from the same
  // row that produced the max — the cheapest way to get "this host's most recent service name" without a subquery.
  const rows = await db
    .select({ host: requestLog.host, service: requestLog.service, latest: sql<number>`max(${requestLog.time})` })
    .from(requestLog)
    .where(gte(requestLog.time, new Date(Date.now() - config.ms)))
    .groupBy(requestLog.host);

  const appIds = [...new Set(rows.map((r) => r.service && APP_ID_PREFIX.exec(r.service)?.[1]).filter((id): id is string => Boolean(id)))];
  const apps = appIds.length > 0 ? await db.query.application.findMany({ where: inArray(application.id, appIds), columns: { id: true, name: true } }) : [];
  const nameById = new Map(apps.map((a) => [a.id, a.name]));

  const hosts = rows
    .map((r) => {
      const appId = r.service ? APP_ID_PREFIX.exec(r.service)?.[1] : undefined;
      // A UUID-shaped prefix but no matching row means the application was since deleted — show nothing rather
      // than the raw internal id, which is meaningless on its own. kuberfy's own domain never has that prefix at
      // all (its router/service is just named "kuberfy", see proxy.ts), so it falls through to the raw
      // (already human-readable) Traefik service name instead.
      const service = appId ? (nameById.get(appId) ?? null) : (r.service?.replace(/@docker$/, "") ?? null);
      return { host: r.host, service };
    })
    .sort((a, b) => a.host.localeCompare(b.host));
  return c.json({ hosts });
});

// Table data: distinct client IPs in the range, ranked by request count — same {page, pageSize, total}
// pagination contract as /traffic/events, so it reuses the same TablePagination on the frontend.
observability.get("/traffic/ips", zValidator("query", paginationQuery), async (c) => {
  const range = (c.req.query("range") ?? "24h") as TrafficRange;
  const host = c.req.query("host");
  const config = TRAFFIC_RANGES[range];
  if (!config) return c.json({ error: "Invalid range" }, 400);
  const pagination = c.req.valid("query");

  const where = and(gte(requestLog.time, new Date(Date.now() - config.ms)), host ? eq(requestLog.host, host) : undefined);
  const countExpr = sql<number>`count(*)`;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select({
        clientIp: requestLog.clientIp,
        count: countExpr,
        good: sql<number>`sum(case when ${requestLog.status} < 400 then 1 else 0 end)`,
        warning: sql<number>`sum(case when ${requestLog.status} >= 400 and ${requestLog.status} < 500 then 1 else 0 end)`,
        critical: sql<number>`sum(case when ${requestLog.status} >= 500 then 1 else 0 end)`,
        lastSeen: sql<number>`max(${requestLog.time})`,
      })
      .from(requestLog)
      .where(where)
      .groupBy(requestLog.clientIp)
      .orderBy(desc(countExpr))
      .limit(pagination.pageSize)
      .offset(paginationOffset(pagination)),
    db
      .select({ total: sql<number>`count(distinct ${requestLog.clientIp})` })
      .from(requestLog)
      .where(where),
  ]);

  const items = rows.map((r) => ({
    clientIp: r.clientIp ?? "Unknown",
    count: r.count,
    good: r.good,
    warning: r.warning,
    critical: r.critical,
    lastSeen: new Date(r.lastSeen * 1000).toISOString(),
  }));
  return c.json({ items, total: totalRow.total });
});

// Table data: one page of raw rows at a time, instead of every request in the range.
observability.get("/traffic/events", zValidator("query", paginationQuery), async (c) => {
  const range = (c.req.query("range") ?? "24h") as TrafficRange;
  const host = c.req.query("host");
  const config = TRAFFIC_RANGES[range];
  if (!config) return c.json({ error: "Invalid range" }, 400);
  const pagination = c.req.valid("query");

  const where = and(gte(requestLog.time, new Date(Date.now() - config.ms)), host ? eq(requestLog.host, host) : undefined);
  const [rows, total] = await Promise.all([
    db.query.requestLog.findMany({ where, orderBy: desc(requestLog.time), limit: pagination.pageSize, offset: paginationOffset(pagination) }),
    db.$count(requestLog, where),
  ]);
  const items: TrafficEvent[] = rows.map((r) => ({
    time: r.time.toISOString(),
    method: r.method,
    host: r.host,
    path: r.path,
    status: r.status,
    durationMs: r.durationMs,
    service: r.service,
    clientIp: r.clientIp,
    userAgent: r.userAgent,
    protocol: r.protocol,
    originStatus: r.originStatus,
    requestContentSize: r.requestContentSize,
    downstreamContentSize: r.downstreamContentSize,
  }));
  return c.json({ items, total });
});
