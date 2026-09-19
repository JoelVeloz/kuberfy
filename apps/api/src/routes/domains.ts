import { zValidator } from "@hono/zod-validator";
import { StatusCodes } from "http-status-codes";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db";
import { apiCreateDomain, apiUpdateDomain, application, domain } from "../db/schema/app";
import { suggestDomainHost, suggestKuberfyDomainHost } from "../lib/auto-domain";
import { domainTarget, isPostgresApp } from "../lib/database-image";
import { requireAuth } from "../lib/auth-middleware";
import { applyApplicationDomains } from "../services/deploy";

export const domains = new Hono();

function badRequestOnError<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    throw new HTTPException(StatusCodes.BAD_REQUEST, { message: err instanceof Error ? err.message : String(err) });
  }
}

domains.use("*", requireAuth);

domains.get("/suggest", zValidator("query", z.object({ applicationId: z.string().min(1) })), async (c) => {
  const { applicationId } = c.req.valid("query");
  const app = await db.query.application.findFirst({ where: eq(application.id, applicationId) });
  if (!app) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Application not found" });
  return c.json({ host: isPostgresApp(app) ? suggestKuberfyDomainHost() : suggestDomainHost(app.id, app.name) });
});

domains.post("/", zValidator("json", apiCreateDomain), async (c) => {
  const input = c.req.valid("json");
  const app = await db.query.application.findFirst({ where: eq(application.id, input.applicationId) });
  if (!app) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Application not found" });
  const existing = await db.query.domain.findFirst({ where: eq(domain.host, input.host) });
  if (existing) throw new HTTPException(StatusCodes.CONFLICT, { message: "Domain already in use" });
  const target = badRequestOnError(() => domainTarget(app, input.port, input.allowlist));

  const siblingCount = await db.$count(domain, eq(domain.applicationId, input.applicationId));
  const [created] = await db
    .insert(domain)
    .values({ applicationId: input.applicationId, host: input.host, ...target, isPrimary: siblingCount === 0 })
    .returning();
  await applyApplicationDomains(created!.applicationId);
  return c.json(created, StatusCodes.CREATED);
});

domains.patch("/:id", zValidator("json", apiUpdateDomain), async (c) => {
  const input = c.req.valid("json");
  const target = await db.query.domain.findFirst({ where: eq(domain.id, c.req.param("id")), with: { application: { columns: { buildType: true, repoUrl: true } } } });
  if (!target) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Domain not found" });
  const isDatabase = isPostgresApp(target.application);
  if (isDatabase && (input.port !== undefined || input.sslEnabled !== undefined)) {
    throw new HTTPException(StatusCodes.BAD_REQUEST, { message: "Database domains always use TLS on port 5432." });
  }
  if (!isDatabase && input.allowlist) throw new HTTPException(StatusCodes.BAD_REQUEST, { message: "Allowed IPs only apply to database domains." });
  if (input.sslEnabled === true && (target.host === "localhost" || target.host.endsWith(".localhost"))) {
    throw new HTTPException(StatusCodes.BAD_REQUEST, { message: "`.localhost` domains never leave this machine, so they can't get a real SSL certificate." });
  }
  const [updated] = await db
    .update(domain)
    .set({ ...input, allowlist: input.allowlist?.join(",") })
    .where(eq(domain.id, c.req.param("id")))
    .returning();
  if (!updated) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Domain not found" });
  await applyApplicationDomains(updated.applicationId);
  return c.json(updated);
});

domains.patch("/:id/primary", async (c) => {
  const target = await db.query.domain.findFirst({ where: eq(domain.id, c.req.param("id")) });
  if (!target) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Domain not found" });

  db.transaction((tx) => {
    tx.update(domain).set({ isPrimary: false }).where(eq(domain.applicationId, target.applicationId)).run();
    tx.update(domain).set({ isPrimary: true }).where(eq(domain.id, target.id)).run();
  });
  return c.json({ ...target, isPrimary: true });
});

domains.delete("/:id", async (c) => {
  const [deleted] = await db
    .delete(domain)
    .where(eq(domain.id, c.req.param("id")))
    .returning();
  if (!deleted) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Domain not found" });

  if (deleted.isPrimary) {
    const nextPrimary = await db.query.domain.findFirst({ where: eq(domain.applicationId, deleted.applicationId) });
    if (nextPrimary) await db.update(domain).set({ isPrimary: true }).where(eq(domain.id, nextPrimary.id));
  }

  await applyApplicationDomains(deleted.applicationId);
  return c.json(deleted);
});
