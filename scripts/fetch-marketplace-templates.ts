#!/usr/bin/env bun
/**
 * Automated compatibility filter for kuberfy's template marketplace.
 *
 * Kuberfy only deploys a single Application (one image/container, no Compose — see private/PLAN.md,
 * "Fase 3 / Marketplace"). Dokploy, Coolify and Easypanel already publish large open-source template
 * catalogs, but most entries are multi-container stacks (app + Postgres + Redis, etc). Reimplementing
 * that catalog is out of scope; instead, this script fetches real template definitions from their public
 * GitHub repos and keeps only the ones that resolve to exactly one container — i.e. ones kuberfy can
 * actually run today. Run it whenever CANDIDATES below changes:
 *
 *   bun run scripts/fetch-marketplace-templates.ts
 *
 * Output: apps/api/src/data/marketplace-templates.json (committed, read by the API at request time —
 * no network calls at runtime).
 */
import { parse as parseYaml } from "yaml";

const OUTPUT_PATH = new URL("../apps/api/src/data/marketplace-templates.json", import.meta.url);

// Popular, genuinely single-container self-hosted apps (no mandatory external DB/cache) — the shortlist
// this script verifies against real template sources instead of trusting from memory. Extend this list
// and re-run to grow the catalog; the script itself decides pass/fail, not this list.
const CANDIDATES = [
  "pocketbase",
  "uptime-kuma",
  "vaultwarden",
  "n8n",
  "homepage",
  "homarr",
  "excalidraw",
  "gitea",
  "filebrowser",
  "code-server",
  "portainer",
  "grafana",
  "searxng",
  "changedetection",
  "linkding",
  "ntfy",
  "syncthing",
  "dashy",
  "stirling-pdf",
  "calibre-web",
  "freshrss",
  "wikijs",
  "it-tools",
  "glances",
  "meilisearch",
  "minio",
  "audiobookshelf",
  "komga",
  "kavita",
  "grocy",
  "privatebin",
  "dozzle",
  "memos",
  "actualbudget",
  "speedtest-tracker",
  "wastebin",
];

type EnvVarSpec = { key: string; default: string | null; secret: boolean };

type Template = {
  id: string;
  name: string;
  description: string;
  source: "dokploy" | "coolify";
  sourceUrl: string;
  logo: string | null;
  image: string;
  port: number | null;
  envVars: EnvVarSpec[];
  tags: string[];
};

type SkipReason = { id: string; reason: string };

const SECRET_KEY_RE = /PASSWORD|SECRET|TOKEN|_KEY$|^KEY|APIKEY/i;

// Resolves shell-style `${VAR:-default}` fallbacks (e.g. an image tag) — never used for vars with no
// default, since those genuinely depend on the caller and can't be resolved statically.
function resolveDefault(value: string): string {
  return value.replace(/\$\{[A-Z0-9_]+:-([^}]*)\}/gi, "$1");
}

// TOML allows `_` as a digit separator (e.g. `port = 3_000`).
function parseTomlPort(text: string): number | null {
  const match = text.match(/port\s*=\s*(\d[\d_]*)/);
  return match ? Number(match[1].replace(/_/g, "")) : null;
}

async function ghRaw(path: string): Promise<string | null> {
  const res = await fetch(`https://raw.githubusercontent.com/${path}`);
  if (!res.ok) return null;
  return res.text();
}

function countServices(compose: unknown): string[] {
  if (typeof compose !== "object" || compose === null) return [];
  const services = (compose as Record<string, unknown>).services;
  if (typeof services !== "object" || services === null) return [];
  return Object.keys(services as Record<string, unknown>);
}

function extractEnvVars(serviceDef: unknown): EnvVarSpec[] {
  if (typeof serviceDef !== "object" || serviceDef === null) return [];
  const env = (serviceDef as Record<string, unknown>).environment;
  const entries: string[] = Array.isArray(env)
    ? env.filter((e): e is string => typeof e === "string")
    : typeof env === "object" && env !== null
      ? Object.entries(env).map(([k, v]) => `${k}=${v}`)
      : [];

  const specs: EnvVarSpec[] = [];
  for (const entry of entries) {
    const eq = entry.indexOf("=");
    if (eq === -1) continue; // magic/no-value token (e.g. Coolify's SERVICE_URL_*) — not applicable outside their platform
    const key = entry.slice(0, eq).trim();
    const rawValue = entry.slice(eq + 1).trim();
    const isPlaceholder = /^\$\{.*\}$/.test(rawValue);
    specs.push({ key, default: isPlaceholder ? null : rawValue, secret: SECRET_KEY_RE.test(key) });
  }
  return specs;
}

async function tryDokploy(id: string): Promise<Template | SkipReason> {
  const composeText = await ghRaw(`Dokploy/templates/main/blueprints/${id}/docker-compose.yml`);
  if (!composeText) return { id, reason: "not found in Dokploy/templates" };

  const metaText = await ghRaw(`Dokploy/templates/main/blueprints/${id}/meta.json`);
  const tomlText = await ghRaw(`Dokploy/templates/main/blueprints/${id}/template.toml`);
  const meta = metaText ? (JSON.parse(metaText) as { name?: string; description?: string; tags?: string[]; logo?: string }) : {};

  const compose = parseYaml(composeText);
  const serviceNames = countServices(compose);
  if (serviceNames.length !== 1) return { id, reason: `Dokploy blueprint has ${serviceNames.length} services (compose, not a single app)` };

  const serviceName = serviceNames[0]!;
  const serviceDef = (compose as Record<string, Record<string, unknown>>).services[serviceName]!;
  const image = serviceDef.image ? resolveDefault(serviceDef.image as string) : undefined;
  if (!image) return { id, reason: "Dokploy blueprint builds from source instead of a public image" };

  let port: number | null = tomlText ? parseTomlPort(tomlText) : null;
  if (port === null) {
    const expose = serviceDef.expose as unknown[] | undefined;
    const ports = serviceDef.ports as unknown[] | undefined;
    const first = expose?.[0] ?? ports?.[0];
    if (typeof first === "number") port = first;
    if (typeof first === "string") port = Number(first.split(":").pop());
  }

  return {
    id,
    name: meta.name ?? id,
    description: meta.description ?? "",
    source: "dokploy",
    sourceUrl: `https://github.com/Dokploy/templates/tree/main/blueprints/${id}`,
    logo: meta.logo ? `https://raw.githubusercontent.com/Dokploy/templates/main/blueprints/${id}/${meta.logo}` : null,
    image,
    port,
    envVars: extractEnvVars(serviceDef),
    tags: meta.tags ?? [],
  };
}

async function tryCoolify(id: string): Promise<Template | SkipReason> {
  const text = await ghRaw(`coollabsio/coolify/main/templates/compose/${id}.yaml`);
  if (!text) return { id, reason: "not found in coollabsio/coolify templates/compose" };

  const headerLines = text.split("\n").filter((l) => l.startsWith("#"));
  const header = Object.fromEntries(
    headerLines.map((l) => {
      const [k, ...rest] = l.replace(/^#\s*/, "").split(":");
      return [k?.trim(), rest.join(":").trim()];
    }),
  );

  const compose = parseYaml(text.replace(/^#.*$/gm, ""));
  const serviceNames = countServices(compose);
  if (serviceNames.length !== 1) return { id, reason: `Coolify template has ${serviceNames.length} services (compose, not a single app)` };

  const serviceName = serviceNames[0]!;
  const serviceDef = (compose as Record<string, Record<string, unknown>>).services[serviceName]!;
  const image = serviceDef.image ? resolveDefault(serviceDef.image as string) : undefined;
  if (!image) return { id, reason: "Coolify template builds from source instead of a public image" };

  // Coolify's own reverse-proxy magic (`SERVICE_URL_<NAME>_<PORT>` / `SERVICE_FQDN_<NAME>_<PORT>`) names the
  // container's real HTTP port — more reliable than `expose`/`ports`, which can be an unrelated mapping
  // (e.g. Gitea's SSH port).
  let port: number | null = header.port ? Number(header.port) : null;
  if (port === null) {
    const magic = text.match(/SERVICE_(?:URL|FQDN)_[A-Z0-9_]+_(\d+)/);
    if (magic) port = Number(magic[1]);
  }
  if (port === null) {
    const expose = serviceDef.expose as unknown[] | undefined;
    if (typeof expose?.[0] === "number") port = expose[0];
  }

  return {
    id,
    name: id
      .split("-")
      .map((w) => w[0]?.toUpperCase() + w.slice(1))
      .join(" "),
    description: header.slogan ?? "",
    source: "coolify",
    sourceUrl: `https://github.com/coollabsio/coolify/blob/main/templates/compose/${id}.yaml`,
    logo: header.logo ? `https://raw.githubusercontent.com/coollabsio/coolify/main/${header.logo}` : null,
    image,
    port,
    envVars: extractEnvVars(serviceDef),
    tags: header.tags ? header.tags.split(",").map((t) => t.trim()) : [],
  };
}

async function main() {
  const templates: Template[] = [];
  const skipped: SkipReason[] = [];

  for (const id of CANDIDATES) {
    const dokploy = await tryDokploy(id);
    if ("source" in dokploy) {
      templates.push(dokploy);
      continue;
    }

    const coolify = await tryCoolify(id);
    if ("source" in coolify) {
      templates.push(coolify);
      continue;
    }

    skipped.push({ id, reason: `${dokploy.reason}; ${coolify.reason}` });
  }

  templates.sort((a, b) => a.name.localeCompare(b.name));
  await Bun.write(OUTPUT_PATH, JSON.stringify(templates, null, 2) + "\n");

  console.log(`✓ ${templates.length} compatible templates written to ${OUTPUT_PATH.pathname}`);
  if (skipped.length > 0) {
    console.log(`\n✗ ${skipped.length} skipped (multi-service, build-from-source, or not found):`);
    for (const s of skipped) console.log(`  - ${s.id}: ${s.reason}`);
  }
}

main();
