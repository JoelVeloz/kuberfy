import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { users as user } from "./auth";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
};

// ---------------------------------------------------------------------------
// project
// ---------------------------------------------------------------------------

export const project = sqliteTable("projects", {
  id: id(),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  ...timestamps,
});

export const projectRelations = relations(project, ({ one, many }) => ({
  owner: one(user, {
    fields: [project.ownerId],
    references: [user.id],
  }),
  applications: many(application),
}));

export const apiCreateProject = z.object({
  name: z.string().min(1),
});

export const apiUpdateProject = apiCreateProject.partial();

// ---------------------------------------------------------------------------
// application
// ---------------------------------------------------------------------------

export const buildTypes = ["image", "dockerfile"] as const;
export type BuildType = (typeof buildTypes)[number];

export const application = sqliteTable("applications", {
  id: id(),
  projectId: text("project_id")
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  repoUrl: text("repo_url").notNull(),
  branch: text("branch").notNull().default("main"),
  buildType: text("build_type", { enum: buildTypes }).notNull(),
  // only used when buildType === "dockerfile"
  dockerfilePath: text("dockerfile_path"),
  // port the app listens on inside the container; Traefik routes to it directly over the docker network (never published to the host)
  port: integer("port"),
  // TODO: encrypt before the deploy pipeline writes to this (plain JSON for now)
  envVars: text("env_vars"),
  ...timestamps,
});

export const applicationRelations = relations(application, ({ one, many }) => ({
  project: one(project, {
    fields: [application.projectId],
    references: [project.id],
  }),
  deployments: many(deployment),
  domains: many(domain),
}));

export const apiCreateApplication = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
  repoUrl: z.string().min(1),
  branch: z.string().min(1).default("main"),
  buildType: z.enum(buildTypes),
  dockerfilePath: z.string().min(1).optional(),
  envVars: z.string().optional(),
  port: z.number().int().positive().optional(),
});

export const apiUpdateApplication = apiCreateApplication.omit({ projectId: true }).partial();

// ---------------------------------------------------------------------------
// deployment
// ---------------------------------------------------------------------------

export const deploymentStatuses = ["pending", "building", "running", "failed", "stopped"] as const;
export type DeploymentStatus = (typeof deploymentStatuses)[number];

export const deployment = sqliteTable("deployments", {
  id: id(),
  // stays required for now; goes nullable + gets a sibling composeId once compose apps exist (Dokploy-style)
  applicationId: text("application_id")
    .notNull()
    .references(() => application.id, { onDelete: "cascade" }),
  status: text("status", { enum: deploymentStatuses }).notNull().default("pending"),
  commitSha: text("commit_sha"),
  imageTag: text("image_tag"),
  containerId: text("container_id"),
  logs: text("logs"),
  ...timestamps,
});

export const deploymentRelations = relations(deployment, ({ one, many }) => ({
  application: one(application, {
    fields: [deployment.applicationId],
    references: [application.id],
  }),
  jobs: many(job),
}));

export const apiCreateDeployment = z.object({
  applicationId: z.string().min(1),
  commitSha: z.string().optional(),
});

export const apiUpdateDeployment = z.object({
  status: z.enum(deploymentStatuses).optional(),
  commitSha: z.string().optional(),
  imageTag: z.string().optional(),
  logs: z.string().optional(),
});

// ---------------------------------------------------------------------------
// domain
// ---------------------------------------------------------------------------

export const domain = sqliteTable("domains", {
  id: id(),
  // same nullable-later plan as deployment.applicationId above
  applicationId: text("application_id")
    .notNull()
    .references(() => application.id, { onDelete: "cascade" }),
  host: text("host").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const domainRelations = relations(domain, ({ one }) => ({
  application: one(application, {
    fields: [domain.applicationId],
    references: [application.id],
  }),
}));

export const apiCreateDomain = z.object({
  applicationId: z.string().min(1),
  host: z.string().min(1),
});

// ---------------------------------------------------------------------------
// job
// ---------------------------------------------------------------------------

export const jobStatuses = ["queued", "running", "done", "failed"] as const;
export type JobStatus = (typeof jobStatuses)[number];

export const job = sqliteTable("jobs", {
  id: id(),
  type: text("type").notNull(),
  payload: text("payload").notNull(),
  status: text("status", { enum: jobStatuses }).notNull().default("queued"),
  deploymentId: text("deployment_id").references(() => deployment.id, {
    onDelete: "set null",
  }),
  ...timestamps,
});

export const jobRelations = relations(job, ({ one }) => ({
  deployment: one(deployment, {
    fields: [job.deploymentId],
    references: [deployment.id],
  }),
}));

export const apiCreateJob = z.object({
  type: z.string().min(1),
  payload: z.string().min(1),
  deploymentId: z.string().optional(),
});

export const apiUpdateJob = z.object({
  status: z.enum(jobStatuses).optional(),
  payload: z.string().optional(),
});
