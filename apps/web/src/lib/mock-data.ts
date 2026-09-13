// Placeholder data until the API exists; shapes match lib/types.ts so swapping in real hono/client calls later needs no page changes

import type { Application, Deployment, Domain, Project } from "@/lib/types";

export const projects: Project[] = [
  { id: "proj_marketing", name: "Marketing site", createdAt: "2026-06-02T09:14:00Z" },
  { id: "proj_platform", name: "Platform", createdAt: "2026-04-18T13:40:00Z" },
  { id: "proj_internal", name: "Internal tools", createdAt: "2026-08-27T11:05:00Z" },
];

export const applications: Application[] = [
  {
    id: "app_web",
    projectId: "proj_marketing",
    name: "web",
    repoUrl: "git@github.com:kuberfy/marketing-web.git",
    branch: "main",
    buildType: "nixpacks",
    dockerfilePath: null,
    envVars: { NODE_ENV: "production", PUBLIC_SITE_URL: "https://kuberfy.com" },
  },
  {
    id: "app_api",
    projectId: "proj_platform",
    name: "api",
    repoUrl: "git@github.com:kuberfy/platform-api.git",
    branch: "main",
    buildType: "dockerfile",
    dockerfilePath: "Dockerfile",
    envVars: {
      DATABASE_URL: "file:./data/kuberfy.sqlite",
      BETTER_AUTH_SECRET: "changeme",
      PORT: "3000",
    },
  },
  {
    id: "app_worker",
    projectId: "proj_platform",
    name: "worker",
    repoUrl: "git@github.com:kuberfy/platform-api.git",
    branch: "main",
    buildType: "dockerfile",
    dockerfilePath: "Dockerfile.worker",
    envVars: { DATABASE_URL: "file:./data/kuberfy.sqlite" },
  },
  {
    id: "app_status",
    projectId: "proj_internal",
    name: "status-page",
    repoUrl: "git@github.com:kuberfy/status-page.git",
    branch: "develop",
    buildType: "nixpacks",
    dockerfilePath: null,
    envVars: {},
  },
];

export const deployments: Deployment[] = [
  {
    id: "dep_web_3",
    applicationId: "app_web",
    status: "running",
    commitSha: "a1c4e7f",
    imageTag: "web:a1c4e7f",
    logs: "",
    createdAt: "2026-09-11T16:22:00Z",
  },
  {
    id: "dep_web_2",
    applicationId: "app_web",
    status: "stopped",
    commitSha: "9f3b210",
    imageTag: "web:9f3b210",
    logs: "",
    createdAt: "2026-09-08T10:03:00Z",
  },
  {
    id: "dep_web_1",
    applicationId: "app_web",
    status: "failed",
    commitSha: "5e6a8dd",
    imageTag: null,
    logs: "",
    createdAt: "2026-09-05T08:47:00Z",
  },
  {
    id: "dep_api_4",
    applicationId: "app_api",
    status: "building",
    commitSha: "c02f9aa",
    imageTag: null,
    logs: "",
    createdAt: "2026-09-12T07:58:00Z",
  },
  {
    id: "dep_api_3",
    applicationId: "app_api",
    status: "running",
    commitSha: "88de1b3",
    imageTag: "api:88de1b3",
    logs: "",
    createdAt: "2026-09-10T19:31:00Z",
  },
  {
    id: "dep_worker_1",
    applicationId: "app_worker",
    status: "running",
    commitSha: "88de1b3",
    imageTag: "worker:88de1b3",
    logs: "",
    createdAt: "2026-09-10T19:34:00Z",
  },
  {
    id: "dep_status_1",
    applicationId: "app_status",
    status: "pending",
    commitSha: "0ab12cd",
    imageTag: null,
    logs: "",
    createdAt: "2026-09-12T08:00:00Z",
  },
];

export const domains: Domain[] = [
  { id: "dom_web_1", applicationId: "app_web", host: "kuberfy.com" },
  { id: "dom_web_2", applicationId: "app_web", host: "www.kuberfy.com" },
  { id: "dom_api_1", applicationId: "app_api", host: "api.kuberfy.com" },
];

export function getProjectById(id: string): Project | undefined {
  return projects.find((p) => p.id === id);
}

export function getApplicationById(id: string): Application | undefined {
  return applications.find((a) => a.id === id);
}

export function getApplicationsByProject(projectId: string): Application[] {
  return applications.filter((a) => a.projectId === projectId);
}

export function getDeploymentsByApplication(applicationId: string): Deployment[] {
  return deployments.filter((d) => d.applicationId === applicationId).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getLatestDeployment(applicationId: string): Deployment | undefined {
  return getDeploymentsByApplication(applicationId)[0];
}

export function getDomainsByApplication(applicationId: string): Domain[] {
  return domains.filter((d) => d.applicationId === applicationId);
}
