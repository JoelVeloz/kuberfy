const POSTGRES_IMAGES = ["postgres", "postgis", "pgvector", "timescaledb"];

export const POSTGRES_PORT = 5432;

export function isPostgresApp(app: { buildType: string; repoUrl: string }) {
  if (app.buildType !== "image") return false;
  return POSTGRES_IMAGES.includes(app.repoUrl.split("@")[0]!.split("/").pop()!.split(":")[0]!);
}

export function domainTarget(app: { buildType: string; repoUrl: string }, port: number, allowlist: string[] | undefined) {
  if (!isPostgresApp(app)) {
    if (allowlist?.length) throw new Error("Allowed IPs only apply to database domains.");
    return { port, allowlist: null };
  }
  if (!allowlist?.length) throw new Error("A database domain needs at least one allowed IP.");
  return { port: POSTGRES_PORT, allowlist: allowlist.join(",") };
}
