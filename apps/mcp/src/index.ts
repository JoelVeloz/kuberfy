#!/usr/bin/env bun
// A minimal MCP server exposing exactly what's needed to create and deploy projects/applications on a kuberfy
// instance — nothing else (no delete/stop/domain/volume management). Every tool is a thin wrapper over kuberfy's
// own REST API (see kuberfy-client.ts), so it's subject to the same validation and auth as the dashboard itself.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { KuberfyApiError, KuberfyClient } from "./kuberfy-client.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const client = new KuberfyClient({
  baseUrl: requiredEnv("KUBERFY_URL"),
  email: requiredEnv("KUBERFY_EMAIL"),
  password: requiredEnv("KUBERFY_PASSWORD"),
});

const server = new McpServer({ name: "kuberfy", version: "0.1.0" });

function textResult(value: unknown) {
  return { content: [{ type: "text" as const, text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }] };
}

function errorResult(err: unknown) {
  const message = err instanceof KuberfyApiError || err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

server.registerTool(
  "list_projects",
  { description: "List every project on this kuberfy instance, with each one's id (needed to create applications inside it)." },
  async () => {
    try {
      return textResult(await client.listProjects());
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "create_project",
  {
    description: "Create a new, empty project to group related applications. Returns the project's id.",
    inputSchema: { name: z.string().min(1).describe("Display name for the project, e.g. \"Marketing site\".") },
  },
  async ({ name }) => {
    try {
      return textResult(await client.createProject(name));
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "list_app_sizes",
  { description: "List the CPU/memory tiers (nano, micro, small, medium, large) available for an application — pick one of these ids instead of guessing raw numbers." },
  async () => {
    try {
      return textResult(await client.listAppSizes());
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "create_application",
  {
    description:
      "Create an application inside an existing project. Use buildType \"image\" to pull a public/private Docker image (repoUrl is the image reference, e.g. \"postgres:17-alpine\"), or \"dockerfile\" to build from a git repository (repoUrl is the clone URL). Does not deploy it — call deploy_application afterward to actually start it.",
    inputSchema: {
      projectId: z.string().min(1).describe("id of an existing project, from list_projects or create_project."),
      name: z.string().min(1).describe("Application name, unique within the project."),
      buildType: z.enum(["image", "dockerfile"]),
      repoUrl: z.string().min(1).describe("Docker image reference (buildType \"image\") or git clone URL (buildType \"dockerfile\")."),
      branch: z.string().min(1).optional().describe("Git branch to build from. Only used when buildType is \"dockerfile\". Defaults to \"main\"."),
      dockerfilePath: z
        .string()
        .min(1)
        .optional()
        .describe("Path to the Dockerfile, relative to the repo root, e.g. \"docker/prod.Dockerfile\". Only used when buildType is \"dockerfile\". Defaults to \"Dockerfile\" at the repo root."),
      envVars: z.record(z.string(), z.string()).optional().describe("Environment variables to set on the container, as key/value pairs."),
      size: z.enum(["nano", "micro", "small", "medium", "large"]).optional().describe("Size tier from list_app_sizes. Defaults to the smallest tier if omitted."),
    },
  },
  async ({ projectId, name, buildType, repoUrl, branch, dockerfilePath, envVars, size }) => {
    try {
      const sizes = size ? await client.listAppSizes() : [];
      const resolved = sizes.find((s) => s.id === size);
      const app = await client.createApplication({
        projectId,
        name,
        buildType,
        repoUrl,
        branch,
        dockerfilePath,
        envVars,
        ...(resolved ? { memoryLimitMb: resolved.memoryLimitMb, cpuLimit: resolved.cpuLimit } : {}),
      });
      return textResult(app);
    } catch (err) {
      return errorResult(err);
    }
  },
);

server.registerTool(
  "deploy_application",
  {
    description: "Start (or redeploy) an application that was already created with create_application — pulls/builds its image and runs it.",
    inputSchema: { applicationId: z.string().min(1) },
  },
  async ({ applicationId }) => {
    try {
      return textResult(await client.deployApplication(applicationId));
    } catch (err) {
      return errorResult(err);
    }
  },
);

await server.connect(new StdioServerTransport());
