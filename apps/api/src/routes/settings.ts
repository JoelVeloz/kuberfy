import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { apiUpdateSetting, setting } from "../db/schema/app";
import { env } from "../lib/env";
import { suggestKuberfyDomainHost } from "../lib/auto-domain";
import { requireAuth } from "../lib/auth-middleware";
import { setCachedKuberfyDomain } from "../lib/settings-cache";
import { applyKuberfyDomain } from "../services/proxy";
import { applyDatabaseEntrypoint } from "../services/traefik";
import { docker } from "../services/deploy";
import { readListeningPorts, wellKnownServiceName } from "../services/host-ports";
import { getOrCreateMcpToken } from "./mcp";

export const settings = new Hono();

export async function ensureSettingsSeeded() {
  const existing = await db.query.setting.findFirst();
  if (existing) return;
  await db.insert(setting).values({});
}

export async function reconcileRemoteDatabaseAccess() {
  const existing = await db.query.setting.findFirst();
  await applyDatabaseEntrypoint(existing?.remoteDatabaseAccess ?? false);
}

// Pre-auth: the login page needs this to decide whether to show the "Sign in with passkey" button at all.
settings.get("/passkey-enabled", async (c) => {
  const existing = await db.query.setting.findFirst();
  return c.json({ enabled: existing?.passkeyEnabled ?? false });
});

settings.use("*", requireAuth);

// single-row settings: no id in the URL, there's only ever one
settings.get("/", async (c) => {
  const existing = await db.query.setting.findFirst();
  // install.sh detects this once at setup and passes it through as an env var — it never changes afterward,
  // so it's not part of the settings row itself, just surfaced alongside it for reference (e.g. an IP-only install).
  const serverIp = env.SERVER_PUBLIC_IP ?? null;
  return c.json({ ...(existing ?? { id: null, kuberfyDomain: null }), serverIp });
});

settings.get("/suggest-domain", (c) => c.json({ host: suggestKuberfyDomainHost() }));

settings.get("/client-ip", (c) =>
  c.json({ ip: c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip") || null }),
);

// Generates the /api/mcp bearer token on first read, so the MCP setup page always has one to show without a
// separate "generate" step.
settings.get("/mcp-token", async (c) => c.json({ token: await getOrCreateMcpToken() }));

settings.get("/ports", async (c) => {
  const [containers, listening] = await Promise.all([docker.listContainers(), readListeningPorts()]);
  const byKey = new Map<string, { port: number; protocol: string; service: string; source: "docker" | "host" }>();

  for (const container of containers) {
    for (const p of container.Ports) {
      if (!p.PublicPort || (p.IP && p.IP !== "0.0.0.0" && p.IP !== "::")) continue;
      byKey.set(`${p.PublicPort}/${p.Type}`, {
        port: p.PublicPort,
        protocol: p.Type,
        service: (container.Names[0] ?? container.Image).replace(/^\//, ""),
        source: "docker",
      });
    }
  }

  const hostOnly = listening.filter((l) => !byKey.has(`${l.port}/${l.protocol}`));
  for (const l of hostOnly) {
    byKey.set(`${l.port}/${l.protocol}`, { port: l.port, protocol: l.protocol, service: wellKnownServiceName(l.port, l.protocol), source: "host" });
  }

  return c.json({ ports: [...byKey.values()].sort((a, b) => a.port - b.port) });
});

settings.patch("/", zValidator("json", apiUpdateSetting), async (c) => {
  const input = c.req.valid("json");
  const existing = await db.query.setting.findFirst();
  const updated = existing
    ? (
        await db
          .update(setting)
          .set({ ...input, updatedAt: new Date() })
          .where(eq(setting.id, existing.id))
          .returning()
      )[0]
    : (await db.insert(setting).values(input).returning())[0];
  setCachedKuberfyDomain(updated.kuberfyDomain);

  // Not running under Docker Swarm (e.g. local dev via docker-compose, which runs kuberfy as a plain container
  // rather than a Swarm service) — the DB is still updated, only the live route isn't. Reported back rather than
  // swallowed, so the UI doesn't claim something is live when it silently isn't.
  let liveUpdateError: string | null = null;
  if (input.kuberfyDomain !== undefined) {
    try {
      await applyKuberfyDomain(input.kuberfyDomain);
    } catch (err) {
      liveUpdateError = "Not running under Docker Swarm — the domain was saved, but the live Traefik route wasn't updated automatically.";
      console.error("Could not update kuberfy's Traefik route:", err instanceof Error ? err.message : err);
    }
  }

  const proxyRestarting = input.remoteDatabaseAccess !== undefined && input.remoteDatabaseAccess !== (existing?.remoteDatabaseAccess ?? false);
  if (proxyRestarting) {
    applyDatabaseEntrypoint(input.remoteDatabaseAccess!).catch(async (err) => {
      console.error("Could not apply remote database access:", err instanceof Error ? err.message : err);
      await db.update(setting).set({ remoteDatabaseAccess: !input.remoteDatabaseAccess, updatedAt: new Date() }).where(eq(setting.id, updated.id));
    });
  }

  return c.json({ ...updated, liveUpdateError, proxyRestarting });
});
