import { zValidator } from "@hono/zod-validator";
import { StatusCodes } from "http-status-codes";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../db";
import { apiCreateApplication, apiUpdateApplication, application, deployment } from "../db/schema/app";
import { requireAuth } from "../lib/auth-middleware";
import { runDeployment } from "../services/deploy";

export const applications = new Hono();

applications.use("*", requireAuth);

applications.post("/", zValidator("json", apiCreateApplication), async (c) => {
  const input = c.req.valid("json");
  const [created] = await db.insert(application).values(input).returning();
  return c.json(created, StatusCodes.CREATED);
});

applications.get("/:id", async (c) => {
  const found = await db.query.application.findFirst({
    where: eq(application.id, c.req.param("id")),
    with: {
      deployments: { orderBy: desc(deployment.createdAt) },
      domains: true,
    },
  });
  if (!found) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Application not found" });
  return c.json(found);
});

applications.patch("/:id", zValidator("json", apiUpdateApplication), async (c) => {
  const input = c.req.valid("json");
  const [updated] = await db
    .update(application)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(application.id, c.req.param("id")))
    .returning();
  if (!updated) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Application not found" });
  return c.json(updated);
});

applications.post("/:id/deploy", async (c) => {
  const dep = await runDeployment(c.req.param("id"));
  if (!dep) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Application not found" });
  return c.json(dep, StatusCodes.CREATED);
});
