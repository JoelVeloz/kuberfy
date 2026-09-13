import { zValidator } from "@hono/zod-validator";
import { StatusCodes } from "http-status-codes";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { upgradeWebSocket } from "hono/bun";
import { HTTPException } from "hono/http-exception";
import { db } from "../db";
import { apiCreateApplication, apiUpdateApplication, application, deployment } from "../db/schema/app";
import { requireAuth } from "../lib/auth-middleware";
import { docker, restartDeployment, runDeployment, stopDeployment } from "../services/deploy";

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

applications.post("/:id/restart", async (c) => {
  const dep = await restartDeployment(c.req.param("id"));
  if (!dep) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "No deployment to restart" });
  return c.json(dep);
});

applications.post("/:id/stop", async (c) => {
  const dep = await stopDeployment(c.req.param("id"));
  if (!dep) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "No deployment to stop" });
  return c.json(dep);
});

applications.get(
  "/:id/runtime-logs",
  upgradeWebSocket((c) => {
    const applicationId = c.req.param("id");
    type LogStream = { on(event: "data", cb: (chunk: Buffer) => void): void; on(event: "error", cb: (err: Error) => void): void; destroy(): void };
    let stream: LogStream | null = null;
    return {
      onOpen: async (_evt, ws) => {
        const dep = await db.query.deployment.findFirst({
          where: (fields, { eq }) => eq(fields.applicationId, applicationId),
          orderBy: (fields, { desc }) => [desc(fields.createdAt)],
        });
        if (!dep?.containerId) {
          ws.send("No running container for this application yet.");
          ws.close();
          return;
        }
        const logStream = (await docker.getContainer(dep.containerId).logs({ follow: true, stdout: true, stderr: true, tail: 200 })) as unknown as LogStream;
        stream = logStream;
        logStream.on("data", (chunk) => ws.send(chunk.toString("utf-8")));
        logStream.on("error", () => ws.close());
      },
      onClose: () => stream?.destroy(),
    };
  }),
);
