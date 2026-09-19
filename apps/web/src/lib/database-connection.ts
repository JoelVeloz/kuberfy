import type { ApiApplication } from "@/lib/api";

type Env = Record<string, string>;

interface Credentials {
  user?: string;
  password?: string;
  database?: string;
}

interface Engine {
  name: string;
  images: string[];
  scheme: string;
  port: number;
  envName: string;
  initOnlyCredentials: boolean;
  publicQuery?: string;
  credentials: (env: Env, image: string) => Credentials;
  query?: (credentials: Credentials) => string;
}

function mysqlCredentials(env: Env): Credentials {
  const database = env.MYSQL_DATABASE || env.MARIADB_DATABASE;
  const user = env.MYSQL_USER || env.MARIADB_USER;
  if (user) return { user, password: env.MYSQL_PASSWORD || env.MARIADB_PASSWORD, database };
  return { user: "root", password: env.MYSQL_ROOT_PASSWORD || env.MARIADB_ROOT_PASSWORD, database };
}

const ENGINES: Engine[] = [
  {
    name: "PostgreSQL",
    images: ["postgres", "postgis", "pgvector", "timescaledb"],
    scheme: "postgresql",
    port: 5432,
    envName: "DATABASE_URL",
    initOnlyCredentials: true,
    publicQuery: "sslmode=verify-full&sslrootcert=system",
    credentials: (env) => {
      const user = env.POSTGRES_USER || "postgres";
      return { user, password: env.POSTGRES_PASSWORD, database: env.POSTGRES_DB || user };
    },
  },
  { name: "MySQL", images: ["mysql"], scheme: "mysql", port: 3306, envName: "DATABASE_URL", initOnlyCredentials: true, credentials: mysqlCredentials },
  { name: "MariaDB", images: ["mariadb"], scheme: "mysql", port: 3306, envName: "DATABASE_URL", initOnlyCredentials: true, credentials: mysqlCredentials },
  {
    name: "MongoDB",
    images: ["mongo"],
    scheme: "mongodb",
    port: 27017,
    envName: "MONGODB_URI",
    initOnlyCredentials: true,
    credentials: (env) => ({ user: env.MONGO_INITDB_ROOT_USERNAME, password: env.MONGO_INITDB_ROOT_PASSWORD, database: env.MONGO_INITDB_DATABASE }),
    query: (credentials) => (credentials.user ? "authSource=admin" : ""),
  },
  {
    name: "Redis",
    images: ["redis"],
    scheme: "redis",
    port: 6379,
    envName: "REDIS_URL",
    initOnlyCredentials: false,
    credentials: (env, image) => ({ password: image.startsWith("bitnami/") ? env.REDIS_PASSWORD : undefined }),
  },
];

export const MASKED_PASSWORD = "••••••••";

export interface DatabaseConnection {
  engine: string;
  envName: string;
  host: string;
  port: number;
  credentials: Credentials;
  initOnlyCredentials: boolean;
  url: (revealPassword: boolean, publicHost?: string) => string;
}

function imageName(ref: string) {
  const withoutDigest = ref.split("@")[0]!;
  const tagStart = withoutDigest.indexOf(":", withoutDigest.lastIndexOf("/") + 1);
  return tagStart === -1 ? withoutDigest : withoutDigest.slice(0, tagStart);
}

export function databaseConnection(app: Pick<ApiApplication, "id" | "buildType" | "repoUrl" | "envVars">): DatabaseConnection | null {
  if (app.buildType !== "image") return null;
  const image = imageName(app.repoUrl);
  const engine = ENGINES.find((e) => e.images.includes(image.split("/").pop()!));
  if (!engine) return null;

  const env = app.envVars ? (JSON.parse(app.envVars) as Env) : {};
  const credentials = engine.credentials(env, image);
  const host = `kuberfy-${app.id}`;
  const query = engine.query?.(credentials) ?? "";

  return {
    engine: engine.name,
    envName: engine.envName,
    host,
    port: engine.port,
    credentials,
    initOnlyCredentials: engine.initOnlyCredentials,
    url: (revealPassword, publicHost) => {
      const { user, password, database } = credentials;
      const secret = password ? `:${revealPassword ? encodeURIComponent(password) : MASKED_PASSWORD}` : "";
      const auth = user || password ? `${encodeURIComponent(user ?? "")}${secret}@` : "";
      const params = [query, publicHost ? (engine.publicQuery ?? "") : ""].filter(Boolean).join("&");
      const path = database ? `/${encodeURIComponent(database)}` : params ? "/" : "";
      return `${engine.scheme}://${auth}${publicHost ?? host}:${engine.port}${path}${params ? `?${params}` : ""}`;
    },
  };
}
