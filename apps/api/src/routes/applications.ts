import { Writable } from "node:stream";
import { zValidator } from "@hono/zod-validator";
import { StatusCodes } from "http-status-codes";
import { and, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { upgradeWebSocket } from "hono/bun";
import { HTTPException } from "hono/http-exception";
import { db } from "../db";
import { apiCreateApplication, apiUpdateApplication, application, deployment, volume } from "../db/schema/app";
import { requireAuth } from "../lib/auth-middleware";
import { paginationOffset, paginationQuery } from "../lib/pagination";
import {
  activeBuildLogs,
  buildLogEvents,
  docker,
  listServiceTasks,
  parseDockerStats,
  removeExisting,
  resolveContainerId,
  restartDeployment,
  runDeployment,
  stopDeployment,
} from "../services/deploy";

export const applications = new Hono();

applications.use("*", requireAuth);

// registryPassword is write-only — set on create/update, never echoed back in a response
function omitRegistryPassword<T extends { registryPassword: string | null }>({ registryPassword: _registryPassword, ...rest }: T) {
  return rest;
}

applications.post("/", zValidator("json", apiCreateApplication), async (c) => {
  const input = c.req.valid("json");
  const [created] = await db.insert(application).values(input).returning();
  return c.json(omitRegistryPassword(created!), StatusCodes.CREATED);
});

applications.get("/:id", async (c) => {
  const found = await db.query.application.findFirst({
    where: eq(application.id, c.req.param("id")),
    // registryPassword is write-only — never included in a read response
    columns: { registryPassword: false },
    with: {
      // only the latest — the full history is paginated separately via /:id/deployments
      deployments: { orderBy: desc(deployment.createdAt), limit: 1 },
      domains: true,
      volumes: true,
    },
  });
  if (!found) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Application not found" });
  return c.json(found);
});

applications.get("/:id/deployments", zValidator("query", paginationQuery), async (c) => {
  const pagination = c.req.valid("query");
  const where = eq(deployment.applicationId, c.req.param("id"));
  const [items, total] = await Promise.all([
    db.query.deployment.findMany({ where, orderBy: desc(deployment.createdAt), limit: pagination.pageSize, offset: paginationOffset(pagination) }),
    db.$count(deployment, where),
  ]);
  return c.json({ items, total });
});

applications.get("/:id/deployments/:deploymentId", async (c) => {
  const found = await db.query.deployment.findFirst({
    where: and(eq(deployment.id, c.req.param("deploymentId")), eq(deployment.applicationId, c.req.param("id"))),
  });
  if (!found) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Deployment not found" });
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
  return c.json(omitRegistryPassword(updated));
});

// ?deleteVolumes=true also removes the app's actual Docker volumes, not just their DB rows (which cascade away
// with the application regardless). Opt-in and off by default — a volume can hold a database's only copy of its
// data, so silently wiping it alongside the service would turn an app deletion into a data-loss surprise.
applications.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const deleteVolumes = c.req.query("deleteVolumes") === "true";

  // By deterministic name, not deployment.containerId — that column is only written once a deploy finishes,
  // so deleting an app mid-deploy (still pulling/building) would otherwise orphan the service it goes on to create.
  await removeExisting(`kuberfy-${id}`);

  // Looked up before the delete below, since the application row's ON DELETE CASCADE takes these rows with it.
  const appVolumes = deleteVolumes ? await db.query.volume.findMany({ where: eq(volume.applicationId, id) }) : [];

  const [deleted] = await db.delete(application).where(eq(application.id, id)).returning();
  if (!deleted) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Application not found" });

  // Never touches the image this app ran from — it's identified by tag, not owned by this app, and other apps
  // (we've seen a dozen deployed from the exact same tag) or a future redeploy may still need it. Only
  // `docker image prune` (Settings) ever removes an image, and only once nothing running references it.
  for (const v of appVolumes) {
    try {
      await docker.getVolume(v.volumeName).remove();
    } catch {
      // never created (app was never actually deployed with this volume attached) — nothing to clean up
    }
  }

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

// Every task Swarm has scheduled for this application's current service — including ones a restart already
// replaced — so a previous container's logs stay reachable, not just the one running right now.
applications.get("/:id/tasks", async (c) => {
  const dep = await db.query.deployment.findFirst({
    where: (fields, { eq }) => eq(fields.applicationId, c.req.param("id")),
    orderBy: (fields, { desc }) => [desc(fields.createdAt)],
  });
  if (!dep?.containerId) return c.json({ items: [] });
  return c.json({ items: await listServiceTasks(dep.containerId) });
});

applications.get(
  "/:id/runtime-logs",
  upgradeWebSocket((c) => {
    const applicationId = c.req.param("id");
    // Omitted (or "live"): follow the current running container. Otherwise: a static tail of a specific past
    // task's container, picked from GET /:id/tasks — verified against that same task list below, so a client
    // can't pass an arbitrary container id from elsewhere on the host and read its logs.
    const requestedContainerId = c.req.query("containerId");
    type LogStream = {
      on(event: "data", cb: (chunk: Buffer) => void): void;
      on(event: "error", cb: (err: Error) => void): void;
      on(event: "end", cb: () => void): void;
      destroy(): void;
    };
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

        let containerId: string | null;
        let follow: boolean;
        if (requestedContainerId) {
          const tasks = await listServiceTasks(dep.containerId);
          const matched = tasks.find((t) => t.containerId === requestedContainerId);
          containerId = matched?.containerId ?? null;
          follow = matched?.state === "running";
        } else {
          containerId = await resolveContainerId(dep.containerId);
          follow = true;
        }
        if (!containerId) {
          ws.send("Container not found — it may have been garbage-collected since the task list was loaded.");
          ws.close();
          return;
        }

        const container = docker.getContainer(containerId);
        const [info, logStream] = await Promise.all([
          container.inspect(),
          container.logs({ follow, stdout: true, stderr: true, tail: 200 }) as unknown as Promise<LogStream>,
        ]);
        stream = logStream;
        if (info.Config.Tty) {
          logStream.on("data", (chunk) => ws.send(chunk.toString("utf-8")));
        } else {
          const sink = new Writable({
            write: (chunk: Buffer, _encoding, callback) => {
              ws.send(chunk.toString("utf-8"));
              callback();
            },
          });
          docker.modem.demuxStream(logStream as unknown as NodeJS.ReadableStream, sink, sink);
        }
        logStream.on("error", () => ws.close());
        if (!follow) logStream.on("end", () => ws.close());
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
        const containerId = dep?.containerId ? await resolveContainerId(dep.containerId) : null;
        if (!containerId) {
          ws.close();
          return;
        }
        const statsStream = (await docker.getContainer(containerId).stats({ stream: true })) as unknown as StatsStream;
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
        const containerId = dep?.containerId ? await resolveContainerId(dep.containerId) : null;
        if (!containerId) {
          ws.send("No running container for this application yet.");
          ws.close();
          return;
        }
        const exec = await docker.getContainer(containerId).exec({ Cmd: shellCmd, AttachStdin: true, AttachStdout: true, AttachStderr: true, Tty: true });

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
