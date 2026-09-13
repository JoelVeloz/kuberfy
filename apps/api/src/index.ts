import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic, websocket } from "hono/bun";
import { HTTPException } from "hono/http-exception";
import { StatusCodes } from "http-status-codes";
import { auth } from "./auth";
import { env } from "./lib/env";
import projects from "./routes/projects";
import { applications } from "./routes/applications";
import { domains } from "./routes/domains";
import { marketplace } from "./routes/marketplace";
import { settings, ensureSettingsSeeded } from "./routes/settings";
import { observability } from "./routes/observability";
import { system } from "./routes/system";
import { users } from "./routes/users";
import { reconcileInterruptedDeployments } from "./services/deploy";

await reconcileInterruptedDeployments();
await ensureSettingsSeeded();

const app = new Hono();

app.use("*", logger());
// Same-origin in production (this header is simply unused there); in dev, web and api are genuinely different
// origins/ports, so plain fetches need this to read the response — WebSockets aren't subject to CORS at all.
app.use("*", cors({ origin: (origin) => (env.CORS_ORIGINS?.includes(origin) ? origin : ""), credentials: true }));

app.get("/api/health", (c) => c.json({ ok: true }));
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.route("/api/projects", projects);
app.route("/api/applications", applications);
app.route("/api/domains", domains);
app.route("/api/marketplace/templates", marketplace);
app.route("/api/settings", settings);
app.route("/api/observability", observability);
app.route("/api/system", system);
app.route("/api/users", users);

app.use("/*", serveStatic({ root: "./public" }));

app.notFound((c) => c.json({ error: "Not found" }, StatusCodes.NOT_FOUND));

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Internal server error" }, StatusCodes.INTERNAL_SERVER_ERROR);
});

export type AppType = typeof app;
export { app };
export default { fetch: app.fetch, websocket };
