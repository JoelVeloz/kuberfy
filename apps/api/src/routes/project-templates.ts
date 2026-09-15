import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { requireAuth } from "../lib/auth-middleware";
import { appSizes, type AppSizeId } from "../lib/app-sizes";
import { projectTemplates } from "../data/project-templates";
import { deployProjectTemplate } from "../services/project-templates";

const projectTemplatesRoute = new Hono<{ Variables: { user: { id: string } } }>();

projectTemplatesRoute.use("*", requireAuth);

// Static catalog, same pattern as GET /api/marketplace — no network calls at request time.
projectTemplatesRoute.get("/", (c) => c.json(projectTemplates));

const sizeIds = appSizes.map((s) => s.id) as [string, ...string[]];
const deployBody = z.object({
  projectName: z.string().trim().min(1).optional(),
  sizeOverrides: z.record(z.string(), z.enum(sizeIds)).optional(),
});

projectTemplatesRoute.post("/:id/deploy", zValidator("json", deployBody), async (c) => {
  const template = projectTemplates.find((t) => t.id === c.req.param("id"));
  if (!template) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Project template not found" });

  const { projectName, sizeOverrides } = c.req.valid("json");
  const result = await deployProjectTemplate(template, c.get("user").id, { projectName, sizeOverrides: sizeOverrides as Record<string, AppSizeId> | undefined });
  return c.json(result, StatusCodes.CREATED);
});

export { projectTemplatesRoute as projectTemplates };
