// Thin fetch wrappers for the real backend — dynamic pages fetch client-side since real ids only exist at request time
import type { BuildType, DeploymentStatus } from "@/lib/types";
import { apiUrl } from "@/lib/api-url";

export interface ApiProject {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApiApplication {
  id: string;
  projectId: string;
  name: string;
  repoUrl: string;
  branch: string;
  buildType: BuildType;
  dockerfilePath: string | null;
  envVars: string | null;
  memoryLimitMb: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiDeployment {
  id: string;
  applicationId: string;
  status: DeploymentStatus;
  commitSha: string | null;
  imageTag: string | null;
  logs: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiDomain {
  id: string;
  applicationId: string;
  host: string;
  port: number;
  isPrimary: boolean;
  sslEnabled: boolean;
  createdAt: string;
}

export interface ApiApplicationDetail extends ApiApplication {
  deployments: ApiDeployment[];
  domains: ApiDomain[];
}

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: string | null;
  createdAt: string;
}

export interface ApiSettings {
  id: string | null;
  kuberfyDomain: string | null;
  exposePanelPort: boolean;
  // only set on a PATCH response — non-null means the DB saved but the live Traefik/port update didn't apply
  // (e.g. not running under Docker Swarm)
  liveUpdateError?: string | null;
}

export interface ApiExposedPort {
  port: number;
  protocol: string;
  container: string;
}

export interface ApiMarketplaceTemplateEnvVar {
  key: string;
  default: string | null;
  secret: boolean;
}

export interface ApiMarketplaceTemplate {
  id: string;
  name: string;
  description: string;
  source: "dokploy" | "coolify";
  sourceUrl: string;
  logo: string | null;
  image: string;
  port: number | null;
  envVars: ApiMarketplaceTemplateEnvVar[];
  tags: string[];
}

export class UnauthorizedError extends Error {}
export class NotFoundError extends Error {}

// @hono/zod-validator's default failure response shapes the error as { error: { name: "ZodError", message: "<json array of issues>" } }
// instead of a plain string — unwrap it so the UI shows the real validation message (e.g. "Must be a valid hostname") and not "[object Object]".
function extractErrorMessage(body: unknown, path: string, status: number): string {
  const error = (body as { error?: unknown; message?: unknown } | null)?.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "name" in error && (error as { name: unknown }).name === "ZodError") {
    try {
      const issues = JSON.parse((error as { message: string }).message) as Array<{ message?: string }>;
      if (issues[0]?.message) return issues[0].message;
    } catch {
      // fall through to the generic message below
    }
  }
  const message = (body as { message?: unknown } | null)?.message;
  if (typeof message === "string") return message;
  return `${path} failed with ${status}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), { credentials: "include", ...init });
  if (res.status === 401) {
    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    throw new UnauthorizedError();
  }
  if (res.status === 404) throw new NotFoundError();
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(extractErrorMessage(body, path, res.status));
  }
  return res.json();
}

export const api = {
  listProjects: () => request<ApiProject[]>("/api/projects"),
  createProject: (name: string) =>
    request<ApiProject>("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  getProject: (id: string) => request<ApiProject>(`/api/projects/${id}`),
  updateProject: (id: string, name: string) =>
    request<ApiProject>(`/api/projects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  listProjectApplications: (id: string) => request<ApiApplication[]>(`/api/projects/${id}/applications`),
  getApplication: (id: string) => request<ApiApplicationDetail>(`/api/applications/${id}`),
  createApplication: (input: { projectId: string; name: string; repoUrl: string; branch: string; buildType: BuildType; envVars?: string }) =>
    request<ApiApplication>("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  updateApplicationEnvVars: (id: string, envVars: Record<string, string>) =>
    request<ApiApplication>(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ envVars: JSON.stringify(envVars) }),
    }),
  updateApplicationMemoryLimit: (id: string, memoryLimitMb: number) =>
    request<ApiApplication>(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memoryLimitMb }),
    }),
  deleteApplication: (id: string) => request<ApiApplication>(`/api/applications/${id}`, { method: "DELETE" }),
  createDomain: (applicationId: string, host: string, port: number) =>
    request<ApiDomain>("/api/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId, host, port }),
    }),
  suggestDomainHost: (applicationId: string) => request<{ host: string }>(`/api/domains/suggest?applicationId=${applicationId}`),
  updateDomainPort: (id: string, port: number) =>
    request<ApiDomain>(`/api/domains/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port }),
    }),
  updateDomainSsl: (id: string, sslEnabled: boolean) =>
    request<ApiDomain>(`/api/domains/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sslEnabled }),
    }),
  deleteDomain: (id: string) => request<ApiDomain>(`/api/domains/${id}`, { method: "DELETE" }),
  setPrimaryDomain: (id: string) => request<ApiDomain>(`/api/domains/${id}/primary`, { method: "PATCH" }),
  deploy: (applicationId: string) => request<ApiDeployment>(`/api/applications/${applicationId}/deploy`, { method: "POST" }),
  restartApplication: (applicationId: string) => request<ApiDeployment>(`/api/applications/${applicationId}/restart`, { method: "POST" }),
  stopApplication: (applicationId: string) => request<ApiDeployment>(`/api/applications/${applicationId}/stop`, { method: "POST" }),
  listMarketplaceTemplates: () => request<ApiMarketplaceTemplate[]>("/api/marketplace/templates"),
  getSettings: () => request<ApiSettings>("/api/settings"),
  suggestKuberfyDomain: () => request<{ host: string }>("/api/settings/suggest-domain"),
  updateSettings: (kuberfyDomain: string) =>
    request<ApiSettings>("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kuberfyDomain }),
    }),
  listExposedPorts: () => request<{ ports: ApiExposedPort[] }>("/api/settings/ports"),
  updatePanelPortExposure: (exposePanelPort: boolean) =>
    request<ApiSettings>("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exposePanelPort }),
    }),
  listUsers: () => request<ApiUser[]>("/api/users"),
  createUser: (email: string, password: string, role: "admin" | "user") =>
    request<ApiUser>("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role }),
    }),
};
