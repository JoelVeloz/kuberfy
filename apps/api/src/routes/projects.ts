import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { StatusCodes } from "http-status-codes";
import { requireAuth } from "../lib/auth-middleware";
import { db, schema } from "../db";
import { apiCreateProject, apiUpdateProject } from "../db/schema/app";

const app = new Hono<{ Variables: { user: { id: string } } }>();

app.use("*", requireAuth);

app.get("/", async (c) => {
  const projects = await db.query.project.findMany({
    where: eq(schema.project.ownerId, c.get("user").id),
  });
  return c.json(projects);
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

app.get("/:id/applications", async (c) => {
  const id = c.req.param("id");
  const project = await db.query.project.findFirst({
    where: and(eq(schema.project.id, id), eq(schema.project.ownerId, c.get("user").id)),
  });
  if (!project) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Project not found" });

  const applications = await db.query.application.findMany({
    where: eq(schema.application.projectId, id),
  });
  return c.json(applications);
});

export default app;
