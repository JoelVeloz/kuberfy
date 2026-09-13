# Routes — non-obvious decisions

**`applications.ts`'s `/:id/exec`**: dockerode's `exec.start({ hijack: true })` never resolves under Bun — Bun's
`net.Socket` is missing the handle-based hijack support Node's http client relies on for the raw upgrade
(`oven-sh/bun#20397`). `exec.create()` is a plain request/response and works fine through dockerode; only the
attach/upgrade step is hand-rolled, talking to the Docker socket directly with `Bun.connect`. Don't revert this
to `dockerode`'s `exec.start` — it will hang forever under Bun with no error.

**`observability.ts`'s Traefik container detection**: Docker's `ancestor` filter needs an exact `image:tag`
match, so the match is done in JS instead (tag-agnostic, but exact on the repo name — a deployed
`traefik/whoami` fixture also starts with `"traefik"` and must not match). It's also scoped to
`kuberfy-apps-network` specifically, since the dev-only Traefik in `docker-compose.dev.yml` (fronting the
web/api dev servers, not deployed apps) runs the same image and would otherwise be picked instead.

**SSL toggle** (`domains.ts` + `services/deploy.ts`): a `.localhost` domain never gets a `websecure`/TLS router
no matter what `sslEnabled` says — Let's Encrypt can't issue for it. `domains.ts` refuses `sslEnabled: true` on
one with a `400`; `deploy.ts` only adds the TLS router when `sslEnabled && !isLocalhost`.

**`projects.ts`'s cascade delete**: deleting a project must remove the real Docker containers of every
application under it, the same way `applications.ts`'s own delete route does — the SQL `ON DELETE CASCADE`
only removes rows, never talks to Docker, so skipping this step leaves running containers orphaned with no DB
record pointing back to them.
