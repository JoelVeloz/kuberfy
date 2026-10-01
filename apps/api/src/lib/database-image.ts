const DATABASE_PORTS: Record<string, number> = {
  postgres: 5432,
  postgis: 5432,
  pgvector: 5432,
  timescaledb: 5432,
  mysql: 3306,
  mariadb: 3306,
  mongo: 27017,
  redis: 6379,
};

function imageBaseName(repoUrl: string) {
  return repoUrl.split("@")[0]!.split("/").pop()!.split(":")[0]!;
}

export function databasePort(app: { buildType: string; repoUrl: string }): number | null {
  if (app.buildType !== "image") return null;
  return DATABASE_PORTS[imageBaseName(app.repoUrl)] ?? null;
}
