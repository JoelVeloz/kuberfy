// The confirmed-working templates come straight from the shared, marketplace-facing source (single source of
// truth — see apps/api/src/data/project-templates.ts). nextjs-postgres is added here only, kept for CLI-only
// tracking of a known limitation (see its TODO below), not offered in the project marketplace.
import { projectTemplates } from "../../src/data/project-templates";
import type { ProjectTemplate } from "../../src/services/project-templates";

const postgresDb: ProjectTemplate["apps"][number] = {
  id: "database",
  name: "database",
  port: 5432,
  image: "postgres:17-alpine",
  volumes: ["/var/lib/postgresql/data"],
  envVars: [
    { key: "POSTGRES_PASSWORD", default: null, secret: true },
    { key: "POSTGRES_USER", default: "postgres", secret: false },
    { key: "POSTGRES_DB", default: "app", secret: false },
  ],
};

const nextjsPostgres: ProjectTemplate = {
  id: "nextjs-postgres",
  projectName: "Next.js + Postgres",
  description: "Known limitation: its /db page needs DATABASE_URL at build time, which kuberfy's dockerfile build pipeline doesn't pass yet.",
  apps: [
    postgresDb,
    {
      id: "nextjs-app",
      name: "nextjs-app",
      port: 3000,
      image: null,
      // real self-hosting reference by Lee Robinson (Vercel) — Drizzle + postgres-js, single root Dockerfile
      repoUrl: "https://github.com/leerob/next-self-host",
      branch: "main",
      dockerfilePath: "Dockerfile",
      exposeDomain: true,
      envVars: [{ key: "DATABASE_URL", default: "postgres://postgres:${database.POSTGRES_PASSWORD}@${database.host}:5432/app", secret: false }],
    },
  ],
};

export const presets: Record<string, ProjectTemplate> = Object.fromEntries([...projectTemplates, nextjsPostgres].map((t) => [t.id, t]));
