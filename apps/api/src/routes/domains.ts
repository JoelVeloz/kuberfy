import { zValidator } from "@hono/zod-validator";
import { StatusCodes } from "http-status-codes";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../db";
import { apiCreateDomain, domain } from "../db/schema/app";
import { requireAuth } from "../lib/auth-middleware";

export const domains = new Hono();

domains.use("*", requireAuth);

domains.post("/", zValidator("json", apiCreateDomain), async (c) => {
  const input = c.req.valid("json");
  const existing = await db.query.domain.findFirst({ where: eq(domain.host, input.host) });
  if (existing) throw new HTTPException(StatusCodes.CONFLICT, { message: "Domain already in use" });

  const [created] = await db.insert(domain).values(input).returning();
  return c.json(created, StatusCodes.CREATED);
});

domains.delete("/:id", async (c) => {
  const [deleted] = await db
    .delete(domain)
    .where(eq(domain.id, c.req.param("id")))
    .returning();
  if (!deleted) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Domain not found" });
  return c.json(deleted);
});
