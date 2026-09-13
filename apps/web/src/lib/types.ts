// UI-side shapes mirroring the backend schema (see private/PLAN.md), kept close to the API so wiring real data later is a small change

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export type BuildType = "image" | "dockerfile";

export interface Application {
  id: string;
  projectId: string;
  name: string;
  repoUrl: string;
  branch: string;
  buildType: BuildType;
  dockerfilePath: string | null;
  envVars: Record<string, string>;
}

export type DeploymentStatus = "pending" | "building" | "running" | "failed" | "stopped";

export interface Deployment {
  id: string;
  applicationId: string;
  status: DeploymentStatus;
  commitSha: string;
  imageTag: string | null;
  logs: string;
  createdAt: string;
}

export interface Domain {
  id: string;
  applicationId: string;
  host: string;
}

export type JobStatus = "queued" | "running" | "done" | "failed";

export interface Job {
  id: string;
  type: string;
  status: JobStatus;
  createdAt: string;
}
