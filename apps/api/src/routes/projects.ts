import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db, schema } from "../db";
import { apiCreateProject } from "../db/schema/app";

const app = new Hono();

app.get("/", async (c) => {
  // TODO: filter by session user once auth middleware is mounted — returns all projects for now
  const projects = await db.query.project.findMany();
  return c.json(projects);
});

app.post("/", zValidator("json", apiCreateProject), async (c) => {
  const data = c.req.valid("json");

  // TODO: use session user id once auth middleware is mounted; falls back to the first admin user until then
  const owner = await db.query.users.findFirst();
  if (!owner) {
    throw new HTTPException(400, { message: "no user found — create an admin first" });
  }

  const [created] = await db
    .insert(schema.project)
    .values({ ...data, ownerId: owner.id })
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
