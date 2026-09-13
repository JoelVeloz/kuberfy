import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { HTTPException } from "hono/http-exception";
import { StatusCodes } from "http-status-codes";
import { auth } from "./auth";
import projects from "./routes/projects";
import { applications } from "./routes/applications";
import { domains } from "./routes/domains";

const app = new Hono();

app.get("/api/health", (c) => c.json({ ok: true }));
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
app.route("/api/projects", projects);
app.route("/api/applications", applications);
app.route("/api/domains", domains);

// Dynamic project/application ids only exist at request time, not at Astro's build time — fall back to the one
// prebuilt shell (see PLAN.md) which reads the real id from the URL and fetches data client-side.
app.use(
  "/*",
  serveStatic({
    root: "./public",
    rewriteRequestPath: (path) => {
      if (/^\/projects\/[^/]+$/.test(path)) return "/projects/_/index.html";
      if (/^\/applications\/[^/]+$/.test(path)) return "/applications/_/index.html";
      return path;
    },
  }),
);

app.notFound((c) => c.json({ error: "Not found" }, StatusCodes.NOT_FOUND));

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: "Internal server error" }, StatusCodes.INTERNAL_SERVER_ERROR);
});

export type AppType = typeof app;
export default app;
