import { randomBytes } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPTransport } from "@hono/mcp";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { application, project, setting } from "../db/schema/app";
import { appSizes, defaultAppSize } from "../lib/app-sizes";
import { runDeployment } from "../services/deploy";

// Deliberately minimal — exactly what's needed to create and deploy projects/applications, nothing to delete or
// reconfigure them. Runs in-process as part of the API server (calling the same functions the REST routes do),
// exposed over Streamable HTTP so any MCP client can connect to this instance directly — no local install needed.
const server = new McpServer({ name: "kuberfy", version: "0.1.0" });
const sizeIds = appSizes.map((s) => s.id) as [string, ...string[]];

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

server.registerTool(
  "list_projects",
  { description: "List every project on this kuberfy instance, with each one's id (needed to create applications inside it)." },
  async () => textResult(await db.query.project.findMany({ orderBy: (f, { desc }) => desc(f.createdAt) })),
);

server.registerTool(
  "create_project",
  {
    description: "Create a new, empty project to group related applications. Returns the project's id.",
    inputSchema: { name: z.string().min(1).describe('Display name for the project, e.g. "Marketing site".') },
  },
  async ({ name }) => {
    const owner = await db.query.users.findFirst();
    if (!owner) throw new Error("No user exists on this instance to own the project.");
    const [created] = await db.insert(project).values({ name, ownerId: owner.id }).returning();
    return textResult(created);
  },
);

server.registerTool("list_app_sizes", { description: "List the CPU/memory tiers available for an application — pick one of these ids instead of guessing raw numbers." }, async () =>
  textResult(appSizes),
);

server.registerTool(
  "create_application",
  {
    description:
      'Create an application inside an existing project. Use buildType "image" to pull a public/private Docker image (repoUrl is the image reference, e.g. "postgres:17-alpine"), or "dockerfile" to build from a git repository (repoUrl is the clone URL). Does not deploy it — call deploy_application afterward to actually start it.',
    inputSchema: {
      projectId: z.string().min(1).describe("id of an existing project, from list_projects or create_project."),
      name: z.string().min(1).describe("Application name, unique within the project."),
      buildType: z.enum(["image", "dockerfile"]),
      repoUrl: z.string().min(1).describe('Docker image reference (buildType "image") or git clone URL (buildType "dockerfile").'),
      branch: z.string().min(1).optional().describe('Git branch to build from. Only used when buildType is "dockerfile". Defaults to "main".'),
      dockerfilePath: z
        .string()
        .min(1)
        .optional()
        .describe('Path to the Dockerfile, relative to the repo root, e.g. "docker/prod.Dockerfile". Only used when buildType is "dockerfile". Defaults to "Dockerfile" at the repo root.'),
      envVars: z.record(z.string(), z.string()).optional().describe("Environment variables to set on the container, as key/value pairs."),
      size: z.enum(sizeIds).optional().describe("Size tier from list_app_sizes. Defaults to the smallest tier if omitted."),
    },
  },
  async ({ projectId, name, buildType, repoUrl, branch, dockerfilePath, envVars, size }) => {
    const resolved = appSizes.find((s) => s.id === size) ?? defaultAppSize;
    const [created] = await db
      .insert(application)
      .values({
        projectId,
        name,
        repoUrl,
        branch: branch ?? "main",
        buildType,
        dockerfilePath,
        envVars: envVars ? JSON.stringify(envVars) : undefined,
        memoryLimitMb: resolved.memoryLimitMb,
        cpuLimit: resolved.cpuLimit,
      })
      .returning();
    return textResult(created);
  },
);

server.registerTool(
  "deploy_application",
  { description: "Start (or redeploy) an application that was already created with create_application — pulls/builds its image and runs it.", inputSchema: { applicationId: z.string().min(1) } },
  async ({ applicationId }) => textResult(await runDeployment(applicationId)),
);

export async function getOrCreateMcpToken(): Promise<string> {
  const row = await db.query.setting.findFirst();
  if (!row) throw new Error("Settings row is missing — ensureSettingsSeeded() should have created it at boot.");
  if (row.mcpToken) return row.mcpToken;
  const token = randomBytes(24).toString("hex");
  await db.update(setting).set({ mcpToken: token }).where(eq(setting.id, row.id));
  return token;
}

// One transport, connected once, reused for every request — connect() binds the McpServer to this specific
// transport instance, so a fresh one per request would leave every request after the first talking to a
// transport the server was never actually connected to.
const transport = new StreamableHTTPTransport();
await server.connect(transport);

export const mcp = new Hono();

mcp.all("/", async (c) => {
  const auth = c.req.header("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const row = await db.query.setting.findFirst();
  if (!token || !row?.mcpToken || token !== row.mcpToken) return c.json({ error: "Unauthorized" }, 401);

  return transport.handleRequest(c);
});
