import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../lib/auth-middleware";
import { db, schema } from "../db";
import { apiCreateProject } from "../db/schema/app";

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
  return c.json(created, 201);
});

app.get("/:id", async (c) => {
  const project = await db.query.project.findFirst({
    where: eq(schema.project.id, c.req.param("id")),
  });
  if (!project) throw new HTTPException(404, { message: "Project not found" });
  return c.json(project);
});

app.get("/:id/applications", async (c) => {
  const id = c.req.param("id");
  const project = await db.query.project.findFirst({
    where: eq(schema.project.id, id),
  });
  if (!project) throw new HTTPException(404, { message: "Project not found" });

  const applications = await db.query.application.findMany({
    where: eq(schema.application.projectId, id),
  });
  return c.json(applications);
});

export default app;
