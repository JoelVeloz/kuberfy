import { generateSecret, type Preset } from "./engine";

export const presets: Record<string, Preset> = {
  "laravel-postgres": {
    projectName: "Laravel + Postgres",
    db: {
      image: "postgres:17-alpine",
      port: 5432,
      volumeMountPath: "/var/lib/postgresql/data",
      env: (password) => ({ POSTGRES_PASSWORD: password, POSTGRES_USER: "postgres", POSTGRES_DB: "app" }),
    },
    app: {
      name: "laravel-app",
      port: 80,
      buildType: "image",
      // bootstraps a real Laravel app on first boot if none exists yet — no repo/build needed
      image: "shinsenter/laravel:php8-nginx",
      // confirmed empirically on a resource-constrained host: at the default "micro" tier (256MB), the first-boot
      // composer+npm+webpack bootstrap pegs memory at ~249MiB/256MiB and crawls for many minutes instead of the
      // ~1-2 min it takes with headroom. Same class of issue as MySQL's — "small" (512MB) is enough.
      size: "small",
      env: (dbHost, dbPassword) => ({
        DB_CONNECTION: "pgsql",
        DB_HOST: dbHost,
        DB_PORT: "5432",
        DB_DATABASE: "app",
        DB_USERNAME: "postgres",
        DB_PASSWORD: dbPassword,
      }),
    },
  },

  "nextjs-postgres": {
    projectName: "Next.js + Postgres",
    db: {
      image: "postgres:17-alpine",
      port: 5432,
      volumeMountPath: "/var/lib/postgresql/data",
      env: (password) => ({ POSTGRES_PASSWORD: password, POSTGRES_USER: "postgres", POSTGRES_DB: "app" }),
    },
    app: {
      name: "nextjs-app",
      port: 3000,
      buildType: "dockerfile",
      // real self-hosting reference by Lee Robinson (Vercel) — Drizzle + postgres-js, single root Dockerfile.
      // Known limitation: its /db page needs DATABASE_URL at build time too, which kuberfy's dockerfile build
      // pipeline doesn't pass yet — see the TODO this preset is tracking against.
      repoUrl: "https://github.com/leerob/next-self-host",
      branch: "main",
      dockerfilePath: "Dockerfile",
      env: (dbHost, dbPassword) => ({ DATABASE_URL: `postgres://postgres:${dbPassword}@${dbHost}:5432/app` }),
    },
  },

  "wordpress-mysql": {
    projectName: "WordPress + MySQL",
    db: {
      image: "mysql:9",
      port: 3306,
      volumeMountPath: "/var/lib/mysql",
      env: (password) => ({ MYSQL_ROOT_PASSWORD: generateSecret(), MYSQL_DATABASE: "wordpress", MYSQL_USER: "wordpress", MYSQL_PASSWORD: password }),
      // confirmed empirically: at kuberfy's default "micro" tier (256MB), mysqld hangs mid-initialization
      // forever (pegged at 256MiB/256MiB, no OOM kill, no error) — 9.x's InnoDB setup genuinely needs more
      // headroom than that. "small" (512MB) is enough.
      size: "small",
    },
    app: {
      name: "wordpress-app",
      port: 80,
      buildType: "image",
      // the official image — WordPress core only ever supports MySQL/MariaDB, never Postgres, without a
      // third-party query-translation plugin (PG4WP) that isn't part of any officially maintained image
      image: "wordpress:latest",
      env: (dbHost, dbPassword) => ({
        WORDPRESS_DB_HOST: dbHost,
        WORDPRESS_DB_USER: "wordpress",
        WORDPRESS_DB_PASSWORD: dbPassword,
        WORDPRESS_DB_NAME: "wordpress",
      }),
    },
  },

  "node-postgres": {
    projectName: "Node.js + Postgres",
    db: {
      image: "postgres:17-alpine",
      port: 5432,
      volumeMountPath: "/var/lib/postgresql/data",
      env: (password) => ({ POSTGRES_PASSWORD: password, POSTGRES_USER: "postgres", POSTGRES_DB: "app" }),
    },
    app: {
      name: "node-app",
      port: 3000,
      buildType: "dockerfile",
      repoUrl: "https://github.com/mucahitnezir/express-starter",
      branch: "master",
      dockerfilePath: "Dockerfile",
      env: (dbHost, dbPassword) => ({
        NODE_ENV: "production",
        DB_HOST: dbHost,
        DB_PORT: "5432",
        DB_USER: "postgres",
        DB_PASSWORD: dbPassword,
        DB_NAME: "app",
      }),
    },
  },

  "n8n-postgres": {
    projectName: "n8n + Postgres",
    db: {
      image: "postgres:17-alpine",
      port: 5432,
      volumeMountPath: "/var/lib/postgresql/data",
      env: (password) => ({ POSTGRES_PASSWORD: password, POSTGRES_USER: "postgres", POSTGRES_DB: "app" }),
    },
    app: {
      name: "n8n-app",
      port: 5678,
      buildType: "image",
      image: "n8nio/n8n:latest",
      size: "medium",
      volumeMountPath: "/home/node/.n8n",
      secretKeys: ["N8N_ENCRYPTION_KEY"],
      env: (dbHost, dbPassword) => ({
        DB_TYPE: "postgresdb",
        DB_POSTGRESDB_HOST: dbHost,
        DB_POSTGRESDB_PORT: "5432",
        DB_POSTGRESDB_DATABASE: "app",
        DB_POSTGRESDB_USER: "postgres",
        DB_POSTGRESDB_PASSWORD: dbPassword,
        N8N_ENCRYPTION_KEY: generateSecret(),
      }),
    },
  },

  "strapi-postgres": {
    projectName: "Strapi + Postgres",
    db: {
      image: "postgres:17-alpine",
      port: 5432,
      volumeMountPath: "/var/lib/postgresql/data",
      env: (password) => ({ POSTGRES_PASSWORD: password, POSTGRES_USER: "postgres", POSTGRES_DB: "app" }),
    },
    app: {
      name: "strapi-app",
      port: 1337,
      buildType: "image",
      image: "vshadbolt/strapi:latest-arm64",
      size: "medium",
      volumeMountPath: "/srv/app",
      env: (dbHost, dbPassword) => ({
        NODE_ENV: "production",
        DATABASE_CLIENT: "postgres",
        DATABASE_HOST: dbHost,
        DATABASE_PORT: "5432",
        DATABASE_NAME: "app",
        DATABASE_USERNAME: "postgres",
        DATABASE_PASSWORD: dbPassword,
      }),
    },
  },
};
