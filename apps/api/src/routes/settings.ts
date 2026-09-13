import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { apiUpdateSetting, setting } from "../db/schema/app";
import { env } from "../lib/env";
import { suggestKuberfyDomainHost } from "../lib/auto-domain";
import { requireAuth } from "../lib/auth-middleware";
import { applyKuberfyDomain, applyKuberfyPanelPortExposure } from "../services/proxy";
import { docker } from "../services/deploy";

export const settings = new Hono();

// The `settings` row is the source of truth for kuberfy's own domain from boot onward — install.sh only uses
// KUBERFY_DOMAIN to give that first row a starting value (Traefik's initial label is already set to the same
// value at `docker service create` time), so this never overwrites a row that already exists.
export async function ensureSettingsSeeded() {
  const existing = await db.query.setting.findFirst();
  if (existing) return;
  await db.insert(setting).values({ kuberfyDomain: env.KUBERFY_DOMAIN ?? "localhost" });
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
  return c.json(existing ?? { id: null, kuberfyDomain: null, exposePanelPort: false });
});

settings.get("/suggest-domain", (c) => c.json({ host: suggestKuberfyDomainHost() }));

// Live snapshot of every host port actually published by Docker right now (Traefik's container, plus kuberfy's
// own :3000 when toggled on) — read straight from the Docker API instead of a hand-maintained list, so it never
// drifts from reality. Ports opened at the OS level outside Docker's own networking (Swarm's manager ports,
// SSH, ...) aren't visible this way — the container only sees Docker's state, not the host's raw socket table.
settings.get("/ports", async (c) => {
  const containers = await docker.listContainers();
  const seen = new Set<string>();
  const ports = containers
    .flatMap((container) =>
      container.Ports.filter((p) => p.PublicPort).map((p) => ({
        port: p.PublicPort as number,
        protocol: p.Type,
        container: (container.Names[0] ?? container.Image).replace(/^\//, ""),
      })),
    )
    .filter((p) => {
      const key = `${p.port}/${p.protocol}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.port - b.port);
  return c.json({ ports });
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
  if (input.exposePanelPort !== undefined) {
    try {
      await applyKuberfyPanelPortExposure(input.exposePanelPort);
    } catch (err) {
      liveUpdateError = "Not running under Docker Swarm — the setting was saved, but the live port wasn't updated automatically.";
      console.error("Could not update kuberfy's published ports:", err instanceof Error ? err.message : err);
    }
  }

  return c.json({ ...updated, liveUpdateError });
});
