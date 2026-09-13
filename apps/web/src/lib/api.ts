// Thin fetch wrappers for the real backend — dynamic pages fetch client-side since real ids only exist at request time
import type { BuildType, DeploymentStatus } from "@/lib/types";

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
  port: number | null;
  envVars: string | null;
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
  createdAt: string;
}

export interface ApiApplicationDetail extends ApiApplication {
  deployments: ApiDeployment[];
  domains: ApiDomain[];
}

export interface ApiSettings {
  id: string | null;
  kuberfyDomain: string | null;
}

export class UnauthorizedError extends Error {}
export class NotFoundError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: "include", ...init });
  if (res.status === 401) {
    window.location.href = `/login?redirect=${encodeURIComponent(window.location.pathname)}`;
    throw new UnauthorizedError();
  }
  if (res.status === 404) throw new NotFoundError();
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? body?.message ?? `${path} failed with ${res.status}`);
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
  createApplication: (input: { projectId: string; name: string; repoUrl: string; branch: string; buildType: BuildType; port?: number }) =>
    request<ApiApplication>("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  updateApplicationPort: (id: string, port: number) =>
    request<ApiApplication>(`/api/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ port }),
    }),
  createDomain: (applicationId: string, host: string) =>
    request<ApiDomain>("/api/domains", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationId, host }),
    }),
  deleteDomain: (id: string) => request<ApiDomain>(`/api/domains/${id}`, { method: "DELETE" }),
  deploy: (applicationId: string) => request<ApiDeployment>(`/api/applications/${applicationId}/deploy`, { method: "POST" }),
  getSettings: () => request<ApiSettings>("/api/settings"),
  updateSettings: (kuberfyDomain: string) =>
    request<ApiSettings>("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kuberfyDomain }),
    }),
};
