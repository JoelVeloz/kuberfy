import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../db";
import { apiCreateApplication, apiUpdateApplication, application, deployment } from "../db/schema/app";

export const applications = new Hono();

applications.post("/", zValidator("json", apiCreateApplication), async (c) => {
  const input = c.req.valid("json");
  const [created] = await db.insert(application).values(input).returning();
  return c.json(created, 201);
});

applications.get("/:id", async (c) => {
  const found = await db.query.application.findFirst({
    where: eq(application.id, c.req.param("id")),
    with: {
      deployments: { orderBy: desc(deployment.createdAt) },
      domains: true,
    },
  });
  if (!found) throw new HTTPException(404, { message: "Application not found" });
  return c.json(found);
});

applications.patch("/:id", zValidator("json", apiUpdateApplication), async (c) => {
  const input = c.req.valid("json");
  const [updated] = await db
    .update(application)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(application.id, c.req.param("id")))
    .returning();
  if (!updated) throw new HTTPException(404, { message: "Application not found" });
  return c.json(updated);
});
