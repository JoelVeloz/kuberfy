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

export interface ApiProjectWithCount extends ApiProject {
  applicationCount: number;
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
  cpuLimit: number;
  // registryPassword is write-only — never sent back by the API
  registryUsername: string | null;
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

export interface ApiVolume {
  id: string;
  applicationId: string;
  mountPath: string;
  volumeName: string;
  createdAt: string;
}

export interface ApiApplicationWithStatus extends ApiApplication {
  latestStatus: DeploymentStatus | null;
}

export interface ApiApplicationDetail extends ApiApplication {
  // only the latest — the full history is fetched separately, paginated, via api.listDeployments
  deployments: ApiDeployment[];
  domains: ApiDomain[];
  volumes: ApiVolume[];
}

// Shared shape for every paginated list endpoint.
export interface ApiPage<T> {
  items: T[];
  total: number;
}

export interface ApiServiceTask {
  taskId: string;
  containerId: string | null;
  state: string;
  message: string | null;
  err: string | null;
  createdAt: string;
}

export interface ApiTrafficEvent {
  time: string;
  method: string;
  host: string;
  path: string;
  status: number;
  durationMs: number;
  service: string | null;
  clientIp: string | null;
  userAgent: string | null;
  protocol: string | null;
  originStatus: number | null;
  requestContentSize: number | null;
  downstreamContentSize: number | null;
}

export interface ApiTrafficSummary {
  range: string;
  buckets: number;
  bucketMs: number;
  counts: Array<{ bucketStart: number; good: number; warning: number; critical: number }>;
}

export interface ApiTrafficIp {
  clientIp: string;
  country: string | null;
  count: number;
  good: number;
  warning: number;
  critical: number;
  lastSeen: string;
}

export interface ApiUser {
  id: string;
  email: string;
  name: string;
  role: string | null;
  createdAt: string;
  passkeyCount: number;
}

export interface ApiUserPasskey {
  id: string;
  name: string | null;
  createdAt: string | null;
  aaguid: string | null;
}

export interface ApiUserSession {
  id: string;
  token: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
}

export interface ApiUserDetail {
  id: string;
  email: string;
  name: string;
  role: string | null;
  createdAt: string;
  passkeys: ApiUserPasskey[];
  sessions: ApiUserSession[];
}

export interface ApiSettings {
  id: string | null;
  kuberfyDomain: string | null;
  exposePanelPort: boolean;
  passkeyEnabled: boolean;
  serverIp: string | null;
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
  source: "dokploy" | "coolify" | "official";
  sourceUrl: string;
  logo: string | null;
  // exactly one of image (buildType "image") or repoUrl+branch+dockerfilePath (buildType "dockerfile") is set
  image: string | null;
  repoUrl?: string;
  branch?: string;
  dockerfilePath?: string;
  port: number | null;
  envVars: ApiMarketplaceTemplateEnvVar[];
  tags: string[];
  volumes: string[];
  category: "application" | "database" | "boilerplate";
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
  listProjects: (page = 1, pageSize = 20) => request<ApiPage<ApiProjectWithCount>>(`/api/projects?page=${page}&pageSize=${pageSize}`),
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
  listProjectApplications: (id: string, page = 1, pageSize = 20) =>
    request<ApiPage<ApiApplicationWithStatus>>(`/api/projects/${id}/applications?page=${page}&pageSize=${pageSize}`),
  getApplication: (id: string) => request<ApiApplicationDetail>(`/api/applications/${id}`),
  listDeployments: (applicationId: string, page = 1, pageSize = 20) =>
    request<ApiPage<ApiDeployment>>(`/api/applications/${applicationId}/deployments?page=${page}&pageSize=${pageSize}`),
  getDeployment: (applicationId: string, deploymentId: string) => request<ApiDeployment>(`/api/applications/${applicationId}/deployments/${deploymentId}`),
  listApplicationTasks: (applicationId: string) => request<{ items: ApiServiceTask[] }>(`/api/applications/${applicationId}/tasks`),
  createApplication: (input: {
    projectId: string;
    name: string;
    repoUrl: string;
    branch: string;
    buildType: BuildType;
    dockerfilePath?: string;
    envVars?: string;
    registryUsername?: string;
    registryPassword?: string;
  }) =>
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
  updateApplicationCpuLimit: (id: string, cpuLimit: number) =>
    request<ApiApplication>(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cpuLimit }),
    }),
  updateApplicationImage: (id: string, input: { repoUrl: string; registryUsername?: string | null; registryPassword?: string | null }) =>
    request<ApiApplication>(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
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
  createVolume: (applicationId: string, mountPath: string) =>
    request<ApiVolume>("/api/volumes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId, mountPath }),
    }),
  deleteVolume: (id: string) => request<ApiVolume>(`/api/volumes/${id}`, { method: "DELETE" }),
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
  pruneDockerResources: () => request<{ spaceReclaimed: number; imagesDeleted: number }>("/api/system/prune", { method: "POST" }),
  checkKuberfyUpdate: () => request<{ updateAvailable: boolean | null; image: string }>("/api/system/check-update", { method: "POST" }),
  updateKuberfy: () => request<{ ok: true }>("/api/system/update", { method: "POST" }),
  listExposedPorts: () => request<{ ports: ApiExposedPort[] }>("/api/settings/ports"),
  updatePanelPortExposure: (exposePanelPort: boolean) =>
    request<ApiSettings>("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ exposePanelPort }),
    }),
  // pre-auth — the login page checks this to decide whether to show the passkey button at all
  getPasskeyEnabled: () => request<{ enabled: boolean }>("/api/settings/passkey-enabled"),
  updatePasskeyEnabled: (passkeyEnabled: boolean) =>
    request<ApiSettings>("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passkeyEnabled }),
    }),
  listUsers: (page = 1, pageSize = 20) => request<ApiPage<ApiUser>>(`/api/users?page=${page}&pageSize=${pageSize}`),
  createUser: (email: string, password: string, role: "admin" | "user") =>
    request<ApiUser>("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, role }),
    }),
  getUser: (id: string) => request<ApiUserDetail>(`/api/users/${id}`),
  revokeUserSession: (userId: string, token: string) => request<{ success: boolean }>(`/api/users/${userId}/sessions/${token}`, { method: "DELETE" }),
  revokeAllUserSessions: (userId: string) => request<{ success: boolean }>(`/api/users/${userId}/sessions`, { method: "DELETE" }),
  deleteUserPasskey: (userId: string, passkeyId: string) => request<{ success: boolean }>(`/api/users/${userId}/passkeys/${passkeyId}`, { method: "DELETE" }),
  getTrafficSummary: (range: string, host?: string) =>
    request<ApiTrafficSummary>(`/api/observability/traffic/summary?range=${range}${host && host !== "all" ? `&host=${encodeURIComponent(host)}` : ""}`),
  getTrafficHosts: (range: string) => request<{ hosts: Array<{ host: string; service: string | null }> }>(`/api/observability/traffic/hosts?range=${range}`),
  listTrafficEvents: (range: string, host: string | undefined, page: number, pageSize: number) =>
    request<ApiPage<ApiTrafficEvent>>(
      `/api/observability/traffic/events?range=${range}&page=${page}&pageSize=${pageSize}${host && host !== "all" ? `&host=${encodeURIComponent(host)}` : ""}`,
    ),
  listTrafficIps: (range: string, host: string | undefined, page: number, pageSize: number) =>
    request<ApiPage<ApiTrafficIp>>(
      `/api/observability/traffic/ips?range=${range}&page=${page}&pageSize=${pageSize}${host && host !== "all" ? `&host=${encodeURIComponent(host)}` : ""}`,
    ),
};
