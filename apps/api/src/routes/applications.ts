import { zValidator } from "@hono/zod-validator";
import { StatusCodes } from "http-status-codes";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { upgradeWebSocket } from "hono/bun";
import { HTTPException } from "hono/http-exception";
import { db } from "../db";
import { apiCreateApplication, apiUpdateApplication, application, deployment } from "../db/schema/app";
import { requireAuth } from "../lib/auth-middleware";
import { activeBuildLogs, buildLogEvents, docker, parseDockerStats, restartDeployment, runDeployment, stopDeployment } from "../services/deploy";

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

applications.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const deployments = await db.query.deployment.findMany({ where: eq(deployment.applicationId, id) });
  for (const dep of deployments) {
    if (!dep.containerId) continue;
    try {
      await docker.getContainer(dep.containerId).remove({ force: true });
    } catch {}
  }
  const [deleted] = await db.delete(application).where(eq(application.id, id)).returning();
  if (!deleted) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Application not found" });
  return c.json(deleted);
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
  "/:id/deployments/:deploymentId/build-logs",
  upgradeWebSocket((c) => {
    const deploymentId = c.req.param("deploymentId");
    const onLine = (id: string, line: string) => id === deploymentId && ws?.send(line);
    const onDone = (id: string) => id === deploymentId && ws?.close();
    let ws: { send(data: string): void; close(): void } | null = null;
    return {
      onOpen: async (_evt, socket) => {
        ws = socket;
        const buffered = activeBuildLogs.get(deploymentId);
        if (buffered) {
          for (const line of buffered) socket.send(line);
          buildLogEvents.on("line", onLine);
          buildLogEvents.on("done", onDone);
          return;
        }
        const dep = await db.query.deployment.findFirst({ where: eq(deployment.id, deploymentId) });
        if (dep?.logs) socket.send(dep.logs);
        socket.close();
      },
      onClose: () => {
        buildLogEvents.off("line", onLine);
        buildLogEvents.off("done", onDone);
      },
    };
  }),
);

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

applications.get(
  "/:id/stats",
  upgradeWebSocket((c) => {
    const applicationId = c.req.param("id");
    type StatsStream = { on(event: "data", cb: (chunk: Buffer) => void): void; on(event: "error", cb: (err: Error) => void): void; destroy(): void };
    let stream: StatsStream | null = null;
    return {
      onOpen: async (_evt, ws) => {
        const dep = await db.query.deployment.findFirst({
          where: (fields, { eq }) => eq(fields.applicationId, applicationId),
          orderBy: (fields, { desc }) => [desc(fields.createdAt)],
        });
        if (!dep?.containerId) {
          ws.close();
          return;
        }
        const statsStream = (await docker.getContainer(dep.containerId).stats({ stream: true })) as unknown as StatsStream;
        stream = statsStream;
        let buffered = "";
        statsStream.on("data", (chunk) => {
          buffered += chunk.toString("utf-8");
          let newlineIndex: number;
          while ((newlineIndex = buffered.indexOf("\n")) !== -1) {
            const line = buffered.slice(0, newlineIndex).trim();
            buffered = buffered.slice(newlineIndex + 1);
            if (!line) continue;
            const sample = parseDockerStats(JSON.parse(line));
            if (sample) ws.send(JSON.stringify(sample));
          }
        });
        statsStream.on("error", () => ws.close());
      },
      onClose: () => stream?.destroy(),
    };
  }),
);

applications.get(
  "/:id/exec",
  upgradeWebSocket((c) => {
    const applicationId = c.req.param("id")!;
    const shell = c.req.query("shell");
    const shellCmd = shell === "bash" ? ["/bin/bash"] : shell === "sh" ? ["/bin/sh"] : ["/bin/sh", "-c", "command -v bash >/dev/null 2>&1 && exec bash || exec sh"];
    let dockerSocket: Bun.Socket | null = null;
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
        const exec = await docker.getContainer(dep.containerId).exec({ Cmd: shellCmd, AttachStdin: true, AttachStdout: true, AttachStderr: true, Tty: true });

        const body = JSON.stringify({ Detach: false, Tty: true });
        const request = `POST /exec/${exec.id}/start HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n${body}`;
        let headerDone = false;
        let buffered = Buffer.alloc(0);

        dockerSocket = await Bun.connect({
          unix: "/var/run/docker.sock",
          socket: {
            open: (sock) => sock.write(request),
            data: (_sock, chunk) => {
              if (headerDone) {
                ws.send(chunk.toString("utf-8"));
                return;
              }
              buffered = Buffer.concat([buffered, chunk]);
              const idx = buffered.indexOf("\r\n\r\n");
              if (idx === -1) return;
              headerDone = true;
              const rest = buffered.subarray(idx + 4);
              buffered = Buffer.alloc(0);
              if (rest.length > 0) ws.send(rest.toString("utf-8"));
            },
            close: () => ws.close(),
            error: () => ws.close(),
          },
        });
      },
      onMessage: (evt) => {
        dockerSocket?.write(typeof evt.data === "string" ? evt.data : Buffer.from(evt.data as ArrayBuffer));
      },
      onClose: () => dockerSocket?.end(),
    };
  }),
);
