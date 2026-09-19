// Curated, confirmed-working project templates for the project marketplace — each one deploys a real, tested
// combination of an app plus the database(s) it needs. Every template here has been deployed and verified end to
// end (a real HTTP response, not just "running" status) against production. Also the source `scripts/fullstack/`
// presets.ts imports from, so the CLI and the marketplace can never drift apart on what a template actually is.
import type { ApplicationSpec, ProjectTemplate } from "../services/project-templates";
import marketplaceTemplates from "./marketplace-templates.json";
import type { AppSizeId } from "../lib/app-sizes";

// Same shape the marketplace API serves — see marketplace-templates.json — which is why a database template from
// there converts to an ApplicationSpec with no field remapping below.
interface MarketplaceTemplate {
  id: string;
  name: string;
  image: string | null;
  port: number;
  envVars: { key: string; default: string | null; secret: boolean }[];
  volumes: string[];
  category: string;
  defaultSize?: AppSizeId;
}

const postgresDb = (id = "database"): ApplicationSpec => ({
  id,
  name: id,
  port: 5432,
  image: "postgres:17-alpine",
  volumes: ["/var/lib/postgresql/data"],
  envVars: [
    { key: "POSTGRES_PASSWORD", default: null, secret: true },
    { key: "POSTGRES_USER", default: "postgres", secret: false },
    { key: "POSTGRES_DB", default: "app", secret: false },
  ],
});

// Every standalone database template the marketplace itself offers, deployed together in one project.
const databaseApps: ApplicationSpec[] = (marketplaceTemplates as MarketplaceTemplate[])
  .filter((t) => t.category === "database")
  .map((t) => ({ id: t.id, name: t.name, port: t.port, image: t.image, volumes: t.volumes, envVars: t.envVars, defaultSize: t.defaultSize }));

const STRESS_TEST_APP_COUNT = 28;

// One copy of the same Express + Sequelize boilerplate, numbered so each instance gets a genuinely unique id —
// ApplicationSpec.id doubles as the Application's name and topoSort() requires it unique within the template.
const nodeAppInstance = (index: number): ApplicationSpec => ({
  id: `node-app-${index}`,
  name: `node-app-${index}`,
  port: 3000,
  image: null,
  repoUrl: "https://github.com/mucahitnezir/express-starter",
  branch: "master",
  dockerfilePath: "Dockerfile",
  exposeDomain: true,
  envVars: [
    { key: "NODE_ENV", default: "production", secret: false },
    { key: "DB_HOST", default: "${database.host}", secret: false },
    { key: "DB_PORT", default: "5432", secret: false },
    { key: "DB_USER", default: "postgres", secret: false },
    { key: "DB_PASSWORD", default: "${database.POSTGRES_PASSWORD}", secret: false },
    { key: "DB_NAME", default: "app", secret: false },
  ],
});

// Same idea as nodeAppInstance, but pulled from an image — no build step, so this stresses deployment
// orchestration (Docker API calls, DB writes) in isolation from build/pull time.
// nodered/node-red (not kornkitti/express-hello-world, which is amd64-only — confirmed via the registry API,
// and crashes with "exec format error" on an arm64 host like Oracle's free-tier Ampere instances) — a real
// Node.js app, published for both amd64 and arm64, so this template actually runs regardless of host CPU.
const nodeImageAppInstance = (index: number): ApplicationSpec => ({
  id: `node-app-${index}`,
  name: `node-app-${index}`,
  port: 1880,
  image: "nodered/node-red:latest",
  exposeDomain: true,
  envVars: [
    { key: "DB_HOST", default: "${database.host}", secret: false },
    { key: "DB_PORT", default: "5432", secret: false },
    { key: "DB_USER", default: "postgres", secret: false },
    { key: "DB_PASSWORD", default: "${database.POSTGRES_PASSWORD}", secret: false },
    { key: "DB_NAME", default: "app", secret: false },
  ],
});

export const projectTemplates: ProjectTemplate[] = [
  {
    id: "s3-storage",
    projectName: "S3 storage",
    description: "S3-compatible object storage plus a web UI already pointed at it, both served over HTTPS.",
    apps: [
      {
        id: "storage",
        name: "storage",
        port: 7070,
        image: "versity/versitygw:v1.8.0",
        volumes: ["/data"],
        exposeDomain: true,
        envVars: [
          { key: "ROOT_ACCESS_KEY", default: null, secret: true },
          { key: "ROOT_SECRET_KEY", default: null, secret: true },
          { key: "VGW_BACKEND", default: "posix", secret: false },
          { key: "VGW_BACKEND_ARG", default: "/data", secret: false },
        ],
      },
      {
        id: "storage-ui",
        name: "storage-ui",
        port: 8080,
        image: "cloudlena/s3manager:latest",
        defaultSize: "nano",
        exposeDomain: true,
        envVars: [
          { key: "ENDPOINT", default: "${storage.host}:7070", secret: false },
          { key: "USE_SSL", default: "false", secret: false },
          { key: "ACCESS_KEY_ID", default: "${storage.ROOT_ACCESS_KEY}", secret: false },
          { key: "SECRET_ACCESS_KEY", default: "${storage.ROOT_SECRET_KEY}", secret: false },
        ],
      },
    ],
  },

  {
    id: "laravel-postgres",
    projectName: "Laravel + Postgres",
    description: "A real Laravel app (bootstrapped on first boot) wired to its own Postgres database.",
    apps: [
      postgresDb(),
      {
        id: "laravel-app",
        name: "laravel-app",
        port: 80,
        // bootstraps a real Laravel app on first boot if none exists yet — no repo/build needed
        image: "shinsenter/laravel:php8-nginx",
        // confirmed empirically on a resource-constrained host: at the default "micro" tier (256MB), the first-boot
        // composer+npm+webpack bootstrap pegs memory at ~249MiB/256MiB and crawls for many minutes instead of the
        // ~1-2 min it takes with headroom. Same class of issue as MySQL's — "small" (512MB) is enough.
        defaultSize: "small",
        exposeDomain: true,
        envVars: [
          { key: "DB_CONNECTION", default: "pgsql", secret: false },
          { key: "DB_HOST", default: "${database.host}", secret: false },
          { key: "DB_PORT", default: "5432", secret: false },
          { key: "DB_DATABASE", default: "app", secret: false },
          { key: "DB_USERNAME", default: "postgres", secret: false },
          { key: "DB_PASSWORD", default: "${database.POSTGRES_PASSWORD}", secret: false },
        ],
      },
    ],
  },

  {
    id: "wordpress-mysql",
    projectName: "WordPress + MySQL",
    description: "The official WordPress image wired to its own MySQL database.",
    apps: [
      {
        id: "database",
        name: "database",
        port: 3306,
        image: "mysql:9",
        volumes: ["/var/lib/mysql"],
        // confirmed empirically: at kuberfy's default "micro" tier (256MB), mysqld hangs mid-initialization
        // forever (pegged at 256MiB/256MiB, no OOM kill, no error) — 9.x's InnoDB setup genuinely needs more
        // headroom than that. "small" (512MB) is enough.
        defaultSize: "small",
        envVars: [
          { key: "MYSQL_ROOT_PASSWORD", default: null, secret: true },
          { key: "MYSQL_DATABASE", default: "wordpress", secret: false },
          { key: "MYSQL_USER", default: "wordpress", secret: false },
          { key: "MYSQL_PASSWORD", default: null, secret: true },
        ],
      },
      {
        id: "wordpress-app",
        name: "wordpress-app",
        port: 80,
        // the official image — WordPress core only ever supports MySQL/MariaDB, never Postgres, without a
        // third-party query-translation plugin (PG4WP) that isn't part of any officially maintained image
        image: "wordpress:latest",
        exposeDomain: true,
        envVars: [
          { key: "WORDPRESS_DB_HOST", default: "${database.host}", secret: false },
          { key: "WORDPRESS_DB_USER", default: "wordpress", secret: false },
          { key: "WORDPRESS_DB_PASSWORD", default: "${database.MYSQL_PASSWORD}", secret: false },
          { key: "WORDPRESS_DB_NAME", default: "wordpress", secret: false },
        ],
      },
    ],
  },

  {
    id: "node-postgres",
    projectName: "Node.js + Postgres",
    description: "A production Express + Sequelize REST API boilerplate, built from source, wired to Postgres.",
    apps: [
      postgresDb(),
      {
        id: "node-app",
        name: "node-app",
        port: 3000,
        image: null,
        repoUrl: "https://github.com/mucahitnezir/express-starter",
        branch: "master",
        dockerfilePath: "Dockerfile",
        exposeDomain: true,
        envVars: [
          { key: "NODE_ENV", default: "production", secret: false },
          { key: "DB_HOST", default: "${database.host}", secret: false },
          { key: "DB_PORT", default: "5432", secret: false },
          { key: "DB_USER", default: "postgres", secret: false },
          { key: "DB_PASSWORD", default: "${database.POSTGRES_PASSWORD}", secret: false },
          { key: "DB_NAME", default: "app", secret: false },
        ],
      },
    ],
  },
  {
    id: "node-image-postgres",
    projectName: "Node.js (image) + Postgres",
    description:
      "A Node.js app (Node-RED) pulled straight from a Docker image, next to a Postgres instance — no build step, unlike the source-based Node.js + Postgres template. Node-RED doesn't read the database env vars itself; wire your own image's variable names once you swap it in.",
    apps: [
      postgresDb(),
      {
        id: "node-app",
        name: "node-app",
        port: 1880,
        image: "nodered/node-red:latest",
        exposeDomain: true,
        envVars: [
          { key: "DB_HOST", default: "${database.host}", secret: false },
          { key: "DB_PORT", default: "5432", secret: false },
          { key: "DB_USER", default: "postgres", secret: false },
          { key: "DB_PASSWORD", default: "${database.POSTGRES_PASSWORD}", secret: false },
          { key: "DB_NAME", default: "app", secret: false },
        ],
      },
    ],
  },
  {
    id: "node-postgres-stress-test",
    projectName: "Node.js + Postgres (stress test)",
    description: "Deploys many identical Node.js instances against one shared Postgres, to load-test deployment throughput — not for everyday use.",
    apps: [postgresDb(), ...Array.from({ length: STRESS_TEST_APP_COUNT }, (_, i) => nodeAppInstance(i + 1))],
  },
  {
    id: "node-image-postgres-stress-test",
    projectName: "Node.js (image) + Postgres (stress test)",
    description:
      "Deploys many identical Node.js instances, pulled from an image (no build step), against one shared Postgres — isolates deployment/orchestration load from build time. Not for everyday use.",
    apps: [postgresDb(), ...Array.from({ length: STRESS_TEST_APP_COUNT }, (_, i) => nodeImageAppInstance(i + 1))],
  },
  {
    id: "n8n-postgres",
    projectName: "n8n + Postgres",
    description: "Self-hosted n8n workflow automation, backed by Postgres instead of its default SQLite.",
    apps: [
      postgresDb(),
      {
        id: "n8n-app",
        name: "n8n-app",
        port: 5678,
        image: "n8nio/n8n:latest",
        // confirmed empirically: Node's default V8 heap sizing OOMs inside a 512MB ("small") cgroup limit —
        // "FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of
        // memory", crash-looping forever. "medium" (1GB) is enough.
        defaultSize: "medium",
        volumes: ["/home/node/.n8n"],
        exposeDomain: true,
        envVars: [
          { key: "DB_TYPE", default: "postgresdb", secret: false },
          { key: "DB_POSTGRESDB_HOST", default: "${database.host}", secret: false },
          { key: "DB_POSTGRESDB_PORT", default: "5432", secret: false },
          { key: "DB_POSTGRESDB_DATABASE", default: "app", secret: false },
          { key: "DB_POSTGRESDB_USER", default: "postgres", secret: false },
          { key: "DB_POSTGRESDB_PASSWORD", default: "${database.POSTGRES_PASSWORD}", secret: false },
          { key: "N8N_ENCRYPTION_KEY", default: null, secret: true },
        ],
      },
    ],
  },

  {
    id: "strapi-postgres",
    projectName: "Strapi + Postgres",
    description: "Strapi headless CMS, scaffolded fresh on first boot, wired to Postgres.",
    apps: [
      postgresDb(),
      {
        id: "strapi-app",
        name: "strapi-app",
        port: 1337,
        // naskio/strapi has no arm64 build; vshadbolt/strapi publishes separate per-arch tags instead of a
        // multi-arch manifest — confirmed empirically against both the arm64 test host and the arm64 (Oracle
        // Ampere) production VM.
        image: "vshadbolt/strapi:latest-arm64",
        // confirmed empirically: the full Strapi 5 scaffold + npm install gets OOM-killed at "small" (512MB).
        // "medium" (1GB) is enough.
        defaultSize: "medium",
        volumes: ["/srv/app"],
        exposeDomain: true,
        envVars: [
          { key: "NODE_ENV", default: "production", secret: false },
          // the entrypoint only runs `strapi build` (compiling the /admin panel) when this is set — otherwise
          // it just runs `strapi start` against whatever build already exists, which is none on a fresh project.
          { key: "BUILD", default: "true", secret: false },
          { key: "DATABASE_CLIENT", default: "postgres", secret: false },
          { key: "DATABASE_HOST", default: "${database.host}", secret: false },
          { key: "DATABASE_PORT", default: "5432", secret: false },
          { key: "DATABASE_NAME", default: "app", secret: false },
          { key: "DATABASE_USERNAME", default: "postgres", secret: false },
          { key: "DATABASE_PASSWORD", default: "${database.POSTGRES_PASSWORD}", secret: false },
        ],
      },
    ],
  },

  {
    id: "databases",
    projectName: "Databases",
    description: "Every standalone database the marketplace offers (Postgres, MySQL, MariaDB, MongoDB, Redis), deployed together.",
    apps: databaseApps,
  },
];
