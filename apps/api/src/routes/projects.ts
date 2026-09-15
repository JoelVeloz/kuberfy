import { zValidator } from "@hono/zod-validator";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { StatusCodes } from "http-status-codes";
import { requireAuth } from "../lib/auth-middleware";
import { db, schema } from "../db";
import { apiCreateProject, apiUpdateProject } from "../db/schema/app";
import { paginationOffset, paginationQuery } from "../lib/pagination";

const app = new Hono<{ Variables: { user: { id: string } } }>();

app.use("*", requireAuth);

app.get("/", zValidator("query", paginationQuery), async (c) => {
  const pagination = c.req.valid("query");
  const [items, total] = await Promise.all([
    db
      .select({
        id: schema.project.id,
        name: schema.project.name,
        ownerId: schema.project.ownerId,
        createdAt: schema.project.createdAt,
        updatedAt: schema.project.updatedAt,
        applicationCount: sql<number>`count(${schema.application.id})`.mapWith(Number),
      })
      .from(schema.project)
      .leftJoin(schema.application, eq(schema.application.projectId, schema.project.id))
      .groupBy(schema.project.id)
      .orderBy(desc(schema.project.createdAt))
      .limit(pagination.pageSize)
      .offset(paginationOffset(pagination)),
    db.$count(schema.project),
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
    where: eq(schema.project.id, c.req.param("id")),
  });
  if (!project) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Project not found" });
  return c.json(project);
});

app.patch("/:id", zValidator("json", apiUpdateProject), async (c) => {
  const data = c.req.valid("json");
  const [updated] = await db
    .update(schema.project)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(schema.project.id, c.req.param("id")))
    .returning();
  if (!updated) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Project not found" });
  return c.json(updated);
});

app.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const applicationCount = await db.$count(schema.application, eq(schema.application.projectId, id));
  if (applicationCount > 0) {
    throw new HTTPException(StatusCodes.CONFLICT, {
      message: `Remove all ${applicationCount} application${applicationCount === 1 ? "" : "s"} from this project before deleting it.`,
    });
  }

  const [deleted] = await db.delete(schema.project).where(eq(schema.project.id, id)).returning();
  if (!deleted) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Project not found" });
  return c.json(deleted);
});

app.get("/:id/applications", zValidator("query", paginationQuery), async (c) => {
  const id = c.req.param("id");
  const pagination = c.req.valid("query");
  const project = await db.query.project.findFirst({ where: eq(schema.project.id, id) });
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

  const applicationIds = items.map((a) => a.id);
  const deployments = applicationIds.length
    ? await db
        .select({ applicationId: schema.deployment.applicationId, status: schema.deployment.status })
        .from(schema.deployment)
        .where(inArray(schema.deployment.applicationId, applicationIds))
        .orderBy(desc(schema.deployment.createdAt))
    : [];
  const latestStatusByApplicationId = new Map<string, (typeof deployments)[number]["status"]>();
  for (const d of deployments) if (!latestStatusByApplicationId.has(d.applicationId)) latestStatusByApplicationId.set(d.applicationId, d.status);

  return c.json({
    items: items.map((a) => ({ ...a, latestStatus: latestStatusByApplicationId.get(a.id) ?? null })),
    total,
  });
});

export default app;
