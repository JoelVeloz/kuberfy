import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { StatusCodes } from "http-status-codes";
import { requireAuth } from "../lib/auth-middleware";
import { db, schema } from "../db";
import { apiCreateProject, apiUpdateProject } from "../db/schema/app";
import { paginationOffset, paginationQuery } from "../lib/pagination";
import { removeExisting } from "../services/deploy";

const app = new Hono<{ Variables: { user: { id: string } } }>();

app.use("*", requireAuth);

app.get("/", zValidator("query", paginationQuery), async (c) => {
  const pagination = c.req.valid("query");
  const where = eq(schema.project.ownerId, c.get("user").id);
  const [items, total] = await Promise.all([
    db.query.project.findMany({ where, orderBy: (fields, { desc }) => [desc(fields.createdAt)], limit: pagination.pageSize, offset: paginationOffset(pagination) }),
    db.$count(schema.project, where),
  ]);
  return c.json({ items, total });
});

app.post("/", zValidator("json", apiCreateProject), async (c) => {
  const data = c.req.valid("json");
  const [created] = await db
    .insert(schema.project)
    .values({ ...data, ownerId: c.get("user").id })
    .returning();
  return c.json(created, StatusCodes.CREATED);
});

app.get("/:id", async (c) => {
  const project = await db.query.project.findFirst({
    where: and(eq(schema.project.id, c.req.param("id")), eq(schema.project.ownerId, c.get("user").id)),
  });
  if (!project) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Project not found" });
  return c.json(project);
});

app.patch("/:id", zValidator("json", apiUpdateProject), async (c) => {
  const data = c.req.valid("json");
  const [updated] = await db
    .update(schema.project)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(schema.project.id, c.req.param("id")), eq(schema.project.ownerId, c.get("user").id)))
    .returning();
  if (!updated) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Project not found" });
  return c.json(updated);
});

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const apps = await db.query.application.findMany({ where: eq(schema.application.projectId, id) });
  // By deterministic name, not deployment.containerId — see the same note in applications.ts's delete route.
  await Promise.all(apps.map((a) => removeExisting(`kuberfy-${a.id}`)));

  const [deleted] = await db
    .delete(schema.project)
    .where(and(eq(schema.project.id, id), eq(schema.project.ownerId, c.get("user").id)))
    .returning();
  if (!deleted) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Project not found" });
  return c.json(deleted);
});

app.get("/:id/applications", zValidator("query", paginationQuery), async (c) => {
  const id = c.req.param("id");
  const pagination = c.req.valid("query");
  const project = await db.query.project.findFirst({
    where: and(eq(schema.project.id, id), eq(schema.project.ownerId, c.get("user").id)),
  });
  if (!project) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Project not found" });

  const where = eq(schema.application.projectId, id);
  const [items, total] = await Promise.all([
    db.query.application.findMany({
      where,
      // registryPassword is write-only — never included in a list/read response
      columns: { registryPassword: false },
      orderBy: (fields, { desc }) => [desc(fields.createdAt)],
      limit: pagination.pageSize,
      offset: paginationOffset(pagination),
    }),
    db.$count(schema.application, where),
  ]);
  return c.json({ items, total });
});

export default app;
