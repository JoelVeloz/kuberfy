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
  "vaultwarden",
  "n8n",
  "homepage",
  "homarr",
  "excalidraw",
  "gitea",
  "filebrowser",
  "code-server",
  "grafana",
  "searxng",
  "changedetection",
  "linkding",
  "syncthing",
  "dashy",
  "stirling-pdf",
  "calibre-web",
  "freshrss",
  "wikijs",
  "it-tools",
  "meilisearch",
  "minio",
  "audiobookshelf",
  "komga",
  "kavita",
  "grocy",
  "privatebin",
  "memos",
  "actualbudget",
  "speedtest-tracker",
  "wastebin",
  "adminer",
  "alist",
  "anonupload",
  "anse",
  "anubis",
  "apprise-api",
  "archivebox",
  "baikal",
  "bentopdf",
  "convertx",
  "crawl4ai",
  "cyberchef",
  "dagu",
  "directory-lister",
  "domain-locker",
  "drawio",
  "drawnix",
  "dumbassets",
  "dumbbudget",
  "dumbdrop",
  "dumbpad",
  "duplicati",
  "etherpad",
  "ezbookkeeping",
  "filestash",
  "flaresolverr",
  "flatnotes",
  "fmd-server",
  "gitingest",
  "gotenberg",
  "gotify",
  "homebox",
  "hoppscotch",
  "imgproxy",
  "ipfs",
  "jellyfin",
  "jellyseerr",
  "kener",
  "kitchenowl",
  "languagetool",
  "libretranslate",
  "librespeed",
  "lubelogger",
  "mailpit",
  "mazanoke",
  "mealie",
  "metube",
  "morphos",
  "navidrome",
  "omni-tools",
  "onetimesecret",
  "openspeedtest",
  "otterwiki",
  "owncast",
  "pairdrop",
  "palmr",
  "photoprism",
  "pocket-id",
  "qbittorrent",
  "rustdesk",
  "scrutiny",
  "shiori",
  "silverbullet",
  "slash",
  "statping-ng",
  "trilium",
  "trilium-next",
  "upsnap",
  "uptimekit",
  "vikunja",
  "wakapi",
  "web-check",
  "yt-dlp-webui",
];

// dozzle, glances, portainer and uptime-kuma were removed: their upstream templates mount
// /var/run/docker.sock into the container (dozzle/portainer can't work at all without it), which
// kuberfy's deploy pipeline has no way to provide — it only ever creates named Docker volumes, never
// host bind mounts.

// wg-easy was removed: it needs the NET_ADMIN capability and /dev/net/tun to create its WireGuard
// interface (confirmed empirically — fails with "Operation not permitted" otherwise), and
// docker.createService() in deploy.ts has no way to grant either.

// garage was removed: it needs a config file mounted into the container (confirmed empirically — fails with
// "IO error: No such file or directory" without one), and kuberfy's deploy pipeline only ever provisions named
// data volumes, never injects arbitrary files.

// ntfy was removed: its image's default command just prints CLI help and exits — it needs an explicit `serve`
// argument to run as a server (confirmed empirically — the task cycles Complete/Rejected forever otherwise),
// and docker.createService() in deploy.ts never sets a custom Command on the container spec.

// filegator and pinchflat were removed TEMPORARILY (not the same permanent-limitation class as the above):
// their images have no linux/arm64 build, which only breaks on an Apple Silicon test host like this one — a
// real amd64 VPS (what install.sh actually targets) would likely pull them fine. Re-add once verified there,
// or once each publishes a multi-arch image.
//
// TODO: the rest of these deployed successfully in earlier isolated runs but failed during a ~100-app
// simultaneous stress test tonight (2026-09-14) — logs showed either the deploy never got far enough to pull
// (host saturated, not a per-app issue) or deploy()'s fixed 30s task-readiness check giving up on a slow-but-
// healthy boot. Re-verify under normal (one-at-a-time) load before assuming any of these are actually broken:
// dagu, duplicati, flaresolverr, flatnotes, jellyfin, jellyseerr, librespeed, libretranslate, lubelogger,
// metube, morphos, nextjs, pairdrop, pocket-id, scrutiny, stirling-pdf, web-check.
// vaultwarden is a separate, known, permanent limitation: it refuses to start without a DOMAIN env var
// containing its own public URL, which isn't knowable until after a domain is assigned post-deploy.

// PostgreSQL, MySQL and MongoDB have no standalone single-container blueprint in either Dokploy/templates
// or coollabsio/coolify — both platforms treat them as a first-class "database" resource type in their own
// app code, not a template. Defined by hand instead, straight from each database's official Docker Hub
// image and documented env vars (verified against the live tags before adding).
const MANUAL_TEMPLATES: Template[] = [
  {
    id: "postgresql",
    name: "PostgreSQL",
    description: "The world's most advanced open source relational database.",
    source: "official",
    sourceUrl: "https://hub.docker.com/_/postgres",
    logo: "https://cdn.simpleicons.org/postgresql/4169E1",
    image: "postgres:17-alpine",
    port: 5432,
    envVars: [
      { key: "POSTGRES_PASSWORD", default: null, secret: true },
      { key: "POSTGRES_USER", default: "postgres", secret: false },
      { key: "POSTGRES_DB", default: "postgres", secret: false },
    ],
    tags: ["database", "sql", "relational"],
    volumes: ["/var/lib/postgresql/data"],
    category: "database",
  },
  {
    id: "mysql",
    name: "MySQL",
    description: "The world's most popular open source relational database.",
    source: "official",
    sourceUrl: "https://hub.docker.com/_/mysql",
    logo: "https://cdn.simpleicons.org/mysql/4479A1",
    image: "mysql:9",
    port: 3306,
    envVars: [
      { key: "MYSQL_ROOT_PASSWORD", default: null, secret: true },
      { key: "MYSQL_DATABASE", default: "app", secret: false },
      { key: "MYSQL_USER", default: "app", secret: false },
      { key: "MYSQL_PASSWORD", default: null, secret: true },
    ],
    tags: ["database", "sql", "relational"],
    volumes: ["/var/lib/mysql"],
    category: "database",
  },
  {
    id: "mariadb",
    name: "MariaDB",
    description: "Community-developed, MySQL-compatible relational database.",
    source: "official",
    sourceUrl: "https://hub.docker.com/_/mariadb",
    logo: "https://cdn.simpleicons.org/mariadb/003545",
    image: "mariadb:11",
    port: 3306,
    envVars: [
      { key: "MARIADB_ROOT_PASSWORD", default: null, secret: true },
      { key: "MARIADB_DATABASE", default: "app", secret: false },
      { key: "MARIADB_USER", default: "app", secret: false },
      { key: "MARIADB_PASSWORD", default: null, secret: true },
    ],
    tags: ["database", "sql", "relational"],
    volumes: ["/var/lib/mysql"],
    category: "database",
  },
  {
    id: "mongodb",
    name: "MongoDB",
    description: "General-purpose, document-based, distributed NoSQL database.",
    source: "official",
    sourceUrl: "https://hub.docker.com/_/mongo",
    logo: "https://cdn.simpleicons.org/mongodb/47A248",
    image: "mongo:8",
    port: 27017,
    envVars: [
      { key: "MONGO_INITDB_ROOT_USERNAME", default: "root", secret: false },
      { key: "MONGO_INITDB_ROOT_PASSWORD", default: null, secret: true },
    ],
    tags: ["database", "nosql", "document"],
    volumes: ["/data/db"],
    category: "database",
  },
  {
    id: "redis",
    name: "Redis",
    description: "In-memory key-value store used as a database, cache, and message broker.",
    source: "official",
    sourceUrl: "https://hub.docker.com/r/bitnami/redis",
    logo: "https://cdn.simpleicons.org/redis/FF4438",
    image: "bitnami/redis:latest",
    port: 6379,
    // the official redis/redis image only takes --requirepass as a launch argument, which our deploy
    // pipeline has no way to pass (image + env vars only, no custom command) — bitnami's image is the
    // well-known build that takes the password as a real env var instead
    envVars: [{ key: "REDIS_PASSWORD", default: null, secret: true }],
    tags: ["database", "cache", "key-value"],
    volumes: ["/bitnami/redis/data"],
    category: "database",
  },
];

// Bare language runtime images (node:24-alpine, python:3.13-alpine, golang:1.24-alpine, ruby:3.4-alpine,
// oven/bun, denoland/deno) exit immediately when run without source code — their default CMD is a REPL/shell
// that hits EOF with no tty attached. php:8.4-apache stays up but serves an empty webroot (403, no index).
// The boilerplate templates below use community-maintained images that bake in a working hello-world
// application so they serve actual content out of the box — verified empirically with `docker run --rm -d`.
const BOILERPLATE_TEMPLATES: Template[] = [
  {
    id: "static-site",
    name: "Static Site",
    description: "Nginx serving its own default page — a starting point for a prebuilt HTML/CSS/JS site.",
    source: "official",
    sourceUrl: "https://hub.docker.com/_/nginx",
    logo: "https://cdn.simpleicons.org/nginx/009639",
    image: "nginx:alpine",
    port: 80,
    envVars: [],
    tags: ["boilerplate", "static", "html", "nginx"],
    volumes: [],
    category: "boilerplate",
  },
  {
    id: "apache-http",
    name: "Apache HTTP",
    description: 'The Apache HTTP Server serving its default "It works!" page — a starting point for static or CGI-based sites.',
    source: "official",
    sourceUrl: "https://hub.docker.com/_/httpd",
    logo: "https://cdn.simpleicons.org/apache/D22128",
    image: "httpd:alpine",
    port: 80,
    envVars: [],
    tags: ["boilerplate", "static", "html", "apache"],
    volumes: [],
    category: "boilerplate",
  },
  {
    id: "php",
    name: "PHP",
    description: "PHP-FPM 8.4 with Nginx on Alpine — serves a phpinfo() page out of the box, ready to replace with your own PHP files.",
    source: "official",
    sourceUrl: "https://hub.docker.com/r/trafex/php-nginx",
    logo: "https://cdn.simpleicons.org/php/777BB4",
    image: "trafex/php-nginx:latest",
    port: 8080,
    envVars: [],
    tags: ["boilerplate", "php", "nginx", "backend"],
    volumes: [],
    category: "boilerplate",
  },
  {
    id: "node-express",
    name: "Node.js (Express)",
    description: "A minimal Express.js hello-world app — serves a welcome page on port 8080, ready to extend with your own routes.",
    source: "official",
    sourceUrl: "https://hub.docker.com/r/kornkitti/express-hello-world",
    logo: "https://cdn.simpleicons.org/nodedotjs/5FA04E",
    image: "kornkitti/express-hello-world:latest",
    port: 8080,
    envVars: [],
    tags: ["boilerplate", "node", "express", "javascript", "backend"],
    volumes: [],
    category: "boilerplate",
  },
  {
    id: "flask",
    name: "Flask (Python)",
    description: "A production-ready Flask starter with uWSGI and Nginx — serves a hello-world page, ready to replace with your own app.",
    source: "official",
    sourceUrl: "https://hub.docker.com/r/tiangolo/uwsgi-nginx-flask",
    logo: "https://cdn.simpleicons.org/flask/000000",
    image: "tiangolo/uwsgi-nginx-flask:python3.11",
    port: 80,
    envVars: [],
    tags: ["boilerplate", "python", "flask", "backend"],
    volumes: [],
    category: "boilerplate",
  },
  {
    id: "fastapi",
    name: "FastAPI (Python)",
    description: "A production-ready FastAPI starter with Uvicorn and Gunicorn — serves a JSON hello-world endpoint, ready for your own API.",
    source: "official",
    sourceUrl: "https://hub.docker.com/r/tiangolo/uvicorn-gunicorn-fastapi",
    logo: "https://cdn.simpleicons.org/fastapi/009688",
    image: "tiangolo/uvicorn-gunicorn-fastapi:python3.11",
    port: 80,
    envVars: [],
    tags: ["boilerplate", "python", "fastapi", "api", "backend"],
    volumes: [],
    category: "boilerplate",
  },
  {
    id: "nextjs",
    name: "Next.js",
    description: "Vercel's own official Docker example — builds from source with the App Router and Next.js's standalone output mode.",
    source: "official",
    sourceUrl: "https://github.com/vercel/next.js/tree/canary/examples/with-docker",
    logo: "https://cdn.simpleicons.org/nextdotjs/000000",
    image: null,
    repoUrl: "https://github.com/vercel/next.js",
    branch: "canary",
    dockerfilePath: "examples/with-docker/Dockerfile",
    port: 3000,
    envVars: [],
    tags: ["boilerplate", "nextjs", "react", "javascript", "frontend"],
    volumes: [],
    category: "boilerplate",
  },
];

type EnvVarSpec = { key: string; default: string | null; secret: boolean };

type Template = {
  id: string;
  name: string;
  description: string;
  source: "dokploy" | "coolify" | "official";
  sourceUrl: string;
  logo: string | null;
  // exactly one of image (buildType "image") or repoUrl+branch+dockerfilePath (buildType "dockerfile") is set
  image: string | null;
  repoUrl?: string;
  branch?: string;
  dockerfilePath?: string;
  port: number | null;
  envVars: EnvVarSpec[];
  tags: string[];
  volumes: string[];
  category: "application" | "database" | "boilerplate";
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

function titleCase(id: string): string {
  return id
    .split("-")
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(" ");
}

async function ghRaw(path: string): Promise<string | null> {
  const res = await fetch(`https://raw.githubusercontent.com/${path}`);
  if (!res.ok) return null;
  return res.text();
}

// Host bind mounts ("/host/path:/x", "./relative:/x", "../relative:/x") aren't something a named Docker
// volume can stand in for, and kuberfy's volumes are always server-generated named volumes (routes/volumes.ts)
// — so only named-volume entries ("some-name:/x") translate into a container path we can actually persist.
const HOST_BIND_RE = /^\.{0,2}\//;
// Some templates mount a named volume over these purely to inject a read-only host file (timezone info) —
// not real application data, so provisioning a persistent volume for them would just be noise.
const NON_DATA_TARGETS = new Set(["/etc/timezone", "/etc/localtime"]);

function extractVolumePaths(serviceDef: unknown): string[] {
  if (typeof serviceDef !== "object" || serviceDef === null) return [];
  const raw = (serviceDef as Record<string, unknown>).volumes;
  if (!Array.isArray(raw)) return [];

  const paths: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue; // long-form { type, source, target } mounts — none of our candidates use them
    // resolveDefault first: a source like "${DATA_DIR:-~/app-data}" has a colon of its own, so splitting the
    // raw entry on ":" cuts it in the wrong place and produces a garbage target (e.g. trilium-next used to).
    const [source, target] = resolveDefault(entry).split(":");
    if (!source || !target || !target.startsWith("/") || HOST_BIND_RE.test(source) || NON_DATA_TARGETS.has(target)) continue;
    paths.push(target);
  }
  return [...new Set(paths)];
}

// dozzle, glances, portainer and uptime-kuma were excluded by hand for this same reason before this check
// existed (see removed-candidates note above) — kuberfy's deploy pipeline only ever creates named Docker
// volumes, never host bind mounts, so a container that needs the host's docker.sock can't actually work.
function usesDockerSocket(serviceDef: unknown): boolean {
  if (typeof serviceDef !== "object" || serviceDef === null) return false;
  const raw = (serviceDef as Record<string, unknown>).volumes;
  if (!Array.isArray(raw)) return false;
  return raw.some((entry) => typeof entry === "string" && entry.includes("docker.sock"));
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
  if (usesDockerSocket(serviceDef)) return { id, reason: "Dokploy blueprint mounts the host's docker.sock" };
  const image = serviceDef.image ? resolveDefault(serviceDef.image as string) : undefined;
  if (!image) return { id, reason: "Dokploy blueprint builds from source instead of a public image" };
  // A variable with no ":-default" (e.g. "${SOFTWARE_VERSION_TAG}") is left untouched by resolveDefault since
  // it genuinely depends on the caller — but that means the literal placeholder would otherwise ship as the
  // image tag kuberfy tries to pull, which always 400s. gitingest hit exactly this.
  if (image.includes("${")) return { id, reason: `Dokploy blueprint's image has an unresolved variable: ${image}` };

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
    name: meta.name && meta.name !== id ? meta.name : titleCase(id),
    description: meta.description ?? "",
    source: "dokploy",
    sourceUrl: `https://github.com/Dokploy/templates/tree/main/blueprints/${id}`,
    logo: meta.logo ? `https://raw.githubusercontent.com/Dokploy/templates/main/blueprints/${id}/${meta.logo}` : null,
    image,
    port,
    envVars: extractEnvVars(serviceDef),
    tags: meta.tags ?? [],
    volumes: extractVolumePaths(serviceDef),
    category: "application",
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
  if (usesDockerSocket(serviceDef)) return { id, reason: "Coolify template mounts the host's docker.sock" };
  const image = serviceDef.image ? resolveDefault(serviceDef.image as string) : undefined;
  if (!image) return { id, reason: "Coolify template builds from source instead of a public image" };
  if (image.includes("${")) return { id, reason: `Coolify template's image has an unresolved variable: ${image}` };

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
    name: titleCase(id),
    description: header.slogan ?? "",
    source: "coolify",
    sourceUrl: `https://github.com/coollabsio/coolify/blob/main/templates/compose/${id}.yaml`,
    logo: header.logo ? `https://raw.githubusercontent.com/coollabsio/coolify/main/${header.logo}` : null,
    image,
    port,
    envVars: extractEnvVars(serviceDef),
    tags: header.tags ? header.tags.split(",").map((t) => t.trim()) : [],
    volumes: extractVolumePaths(serviceDef),
    category: "application",
  };
}

async function main() {
  const templates: Template[] = [...MANUAL_TEMPLATES, ...BOILERPLATE_TEMPLATES];
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
