# Kuberfy

[![Publish image](https://github.com/JoelVeloz/kuberfy/actions/workflows/publish.yml/badge.svg)](https://github.com/JoelVeloz/kuberfy/actions/workflows/publish.yml)
[![License: BUSL 1.1](https://img.shields.io/badge/license-BUSL--1.1-blue.svg)](LICENSE)

[kuberfy.pages.dev](https://kuberfy.pages.dev)

**The lightest self-hosted PaaS.** Deploy applications from a Git repository or a Docker image, get automatic HTTPS, and manage everything from a single web dashboard — running on a footprint small enough for a $5/month VPS.

Kuberfy exists because most self-hosted deployment platforms ship a Postgres server, a Redis instance, and a full Node runtime just to manage a handful of containers. Kuberfy doesn't. The whole control plane — API, dashboard, and database — compiles down to a single static binary and an embedded SQLite file, packaged in an Alpine image with no separate services to run, patch, or back up.

```bash
curl -sSL https://kuberfy.pages.dev/install.sh | sudo sh
```

## Why it's lighter

|                  | Typical self-hosted PaaS | Kuberfy                                                    |
| ---------------- | ------------------------ | ---------------------------------------------------------- |
| Database         | Postgres server          | Embedded SQLite (no separate service)                      |
| Runtime          | Node.js / interpreted    | Compiled binary ([Bun](https://bun.sh))                    |
| Base image       | `node:slim` or similar   | Alpine (~5 MB base)                                        |
| Extra services   | Redis, queue workers     | None                                                       |
| Networking / TLS | Manual or bundled proxy  | [Traefik](https://traefik.io) with automatic Let's Encrypt |
| Orchestration    | Custom agent             | Docker Swarm (built into Docker itself)                    |

Fewer moving parts means fewer things to monitor, fewer things to update, and less RAM sitting idle on a server whose only job is running your apps. Concretely, next to the other self-hosted platforms in this space:

|                            | [Dokploy](https://docs.dokploy.com/docs/core/installation) | [Coolify](https://coolify.io/docs/get-started/installation) | [CapRover](https://caprover.com/docs/get-started.html) | Kuberfy                |
| -------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------ | ---------------------- |
| Stated minimum RAM         | 2 GB                                                       | 2 GB                                                        | ~1 GB (per their docs)                                 | 1 GB                   |
| Control-plane dependencies | Bundled PostgreSQL + Traefik                               | Bundled PostgreSQL + Redis + Soketi                         | None (local volumes) + Nginx + Certbot                 | None — one SQLite file |
| Orchestration              | Docker Swarm                                               | Docker + Compose                                            | Docker Swarm                                           | Docker Swarm           |

Kuberfy is the only one of the four with no bundled database server and no cache — the numbers above are each project's own published minimums, not benchmarks we ran on their software.

## Features

- **Deploy from Git or from an image** — point Kuberfy at a repository and Dockerfile, or at an existing image; it builds (or pulls) and runs it.
- **Projects and applications** — group related services under a project, each with its own applications, domains, and deployment history.
- **Automatic HTTPS** — every application gets a Traefik route and a Let's Encrypt certificate with no manual configuration.
- **Deployment history and logs** — every deploy is recorded with its status and full build/run output.
- **Custom domains** — attach one or more domains to an application independently of the deploy pipeline.
- **Authentication and roles** — email/password login with an admin role, backed by [Better Auth](https://www.better-auth.com).
- **One-command install** — a single script provisions Docker, Swarm, Traefik, and Kuberfy on a fresh Linux server.

## Requirements

Kuberfy's installer targets a single Linux server. Minimum specs, verified by running the installer end-to-end on real VMs (not estimated):

- **OS**: Linux (x86_64 or arm64) — the installer refuses to run on macOS or inside a container
- **CPU**: 1 vCPU
- **RAM**: 1 GB — confirmed working through a full install (Docker, Swarm, Traefik, Kuberfy) with no failures; not tested below 1 GB
- **Disk**: 10 GB free, plus space for your application images
- **Access**: root shell
- **Software**: `curl`; Docker is installed automatically if missing
- **Network**: ports 80 and 443 free (3000 is reserved but not published by default — see [Exposed ports](#exposed-ports) below); a domain name if you want a public hostname (Let's Encrypt requires it — an IP works for local/internal use)

Kuberfy itself is far lighter than the install footprint above: once running, the control plane uses **~23 MB of RAM** and Traefik **~14 MB** (measured with `docker stats`). Most of a fresh VM's memory during install goes to Docker/containerd, not to Kuberfy.

## Installation

The command above is the whole install. When executed, it prompts interactively for your admin email (and an optional domain name if you want automatic HTTPS via Let's Encrypt). For non-interactive automated installs, you can pass them as environment variables:

| Variable         | Required | Description                                                                                     |
| ---------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `ADMIN_EMAIL`    | prompt   | Email for the first admin user (prompted interactively if omitted)                              |
| `KUBERFY_DOMAIN` | no       | Public domain routed to Kuberfy via Traefik. Optional — when omitted, a free `sslip.io` hostname with a random token (not derived from anything guessable) is used instead, with real HTTPS (falls back further to a bare IP, no TLS, only if no public IP can be detected). Only used for this first setup — change it later from the dashboard's Settings page, no restart needed. |
| `KUBERFY_IMAGE`  | no       | Image to pull (default: `ghcr.io/joelveloz/kuberfy:latest`, built for both `amd64` and `arm64`) |
| `KUBERFY_REPO`   | no       | Git URL to build the image from instead of pulling — for testing unreleased changes             |
| `ACME_EMAIL`     | no       | Email used for Let's Encrypt certificates (defaults to `ADMIN_EMAIL`)                           |
| `ADVERTISE_ADDR` | no       | Override automatic IP detection for `docker swarm init`                                         |

Under the hood, the script installs Docker if it's missing, initializes a single-node Docker Swarm, creates an overlay network, pulls the Kuberfy image (or builds it from `KUBERFY_REPO` if set), and starts Kuberfy and Traefik as services. When it finishes, it prints the URL to open and the admin account it created. The published image is a multi-arch manifest (`amd64` + `arm64`), so the same command works on a standard x86_64 VPS or an ARM-based server (Oracle Cloud's ARM tier, AWS Graviton, Apple Silicon for local testing) without any extra flags.

For local development instead of a real server, copy `.env.example` to `.env` and run `docker compose up --build` — the same image, without Swarm.

## Exposed ports

Only 80 and 443 (Traefik) are open by default — everything, including the dashboard itself, is reached through whatever domain is configured, with real HTTPS. The panel's own port 3000 is reserved by the installer but **not** published; it stays off unless you turn on "direct access" from the dashboard's Settings page (an emergency bypass in case Traefik itself is ever broken), and that toggle takes effect immediately, no restart needed. The same Settings page lists every port Docker currently has published on the host, read live rather than hand-maintained.

Docker Swarm's own cluster-management ports (2377/tcp, 7946/tcp+udp, 4789/udp) are blocked by the installer's firewall rules — they're only needed for communication between multiple nodes, which a single-node install never has.

## Updating

To update an existing installation to the latest published remote image (`ghcr.io/joelveloz/kuberfy:latest`), run:

```bash
curl -sSL https://kuberfy.pages.dev/update.sh | sudo sh
```

If you are already on the server host where the CLI wrapper is installed, you can also run:

```bash
kuberfy update
```

Or update the Swarm service directly via Docker:

```bash
docker service update --image ghcr.io/joelveloz/kuberfy:latest --force kuberfy
```

Because the service uses `--update-order stop-first`, Docker Swarm stops the existing container before starting the new one with the updated image, ensuring SQLite database integrity. The new container automatically runs `./kuberfy migrate` on startup to apply any database migrations before serving requests.

## Uninstalling

To cleanly uninstall Kuberfy and remove all associated services, Traefik, deployed applications, overlay networks, volumes, and the host CLI wrapper, run:

```bash
curl -sSL https://kuberfy.pages.dev/uninstall.sh | sudo sh
```

Or directly from the server host:

```bash
kuberfy uninstall
```

## Architecture

```mermaid
flowchart LR
    U(("Internet")) --> T["Traefik\n:80 / :443 · ACME"]
    T --> K["Kuberfy\nAPI + dashboard\nSQLite, one file"]
    K -. builds & runs via\nthe Docker socket .-> A["Your app A"]
    K -. builds & runs via\nthe Docker socket .-> B["Your app B"]
    K -. builds & runs via\nthe Docker socket .-> C["Your app C"]
    T --> A
    T --> B
    T --> C
```

Traefik terminates TLS at the edge and forwards to Kuberfy and to every deployed application. Kuberfy holds all state in a single SQLite file and drives Docker directly to build, run, and monitor your applications — there's no separate scheduler or message queue in between.

The repository is a small monorepo of independent Astro/Bun workspaces:

- **`apps/api`** — the control plane. [Hono](https://hono.dev) on [Bun](https://bun.sh), talking to Docker (`dockerode`) to build images, run containers, and track deployment status, with [Drizzle ORM](https://orm.drizzle.team) over SQLite. Compiled ahead of time into standalone binaries (`bun build --compile`) — the production image ships no Node/Bun runtime, just those binaries on Alpine.
- **`apps/web`** — the dashboard. [Astro](https://astro.build) with React islands, Tailwind CSS, and shadcn/ui, built to static assets and served by the API.
- **`apps/landing`** — the public marketing site, a separate static Astro project with no dependency on the dashboard.

## Development

Requires [Bun](https://bun.sh) and Docker. Install dependencies once from the repo root with `bun install`, then `bun run dev` inside `apps/api` (after `bun run db:migrate`) or `apps/web`. Format and lint with `bunx prettier --write .` and `bunx oxlint .` before committing.

## Status

Kuberfy is under active development. The core deployment flow (projects, applications, Git/image-based deploys, domains, HTTPS) is functional; database provisioning, one-click templates, and multi-node management are on the roadmap.

## License

Kuberfy is source-available under the [Business Source License 1.1](LICENSE): the code is public, you can read it, self-host it, modify it, and run it in production — including inside a product or service you build on top of it. The one thing it rules out is standing up a competing hosted "Kuberfy Cloud" without a commercial agreement. Each release converts to Apache 2.0 four years after it ships (this version: September 13, 2030).

## Contributing

Issues and pull requests are welcome at [github.com/JoelVeloz/kuberfy](https://github.com/JoelVeloz/kuberfy).
