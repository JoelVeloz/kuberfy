import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { unlinkSync } from "node:fs";
import type { Hono } from "hono";

const TEST_DB_PATH = "./test.db";

let app: Hono;

beforeAll(async () => {
  process.env.DATABASE_PATH = TEST_DB_PATH;
  process.env.BETTER_AUTH_SECRET = "test-secret-only-for-bun-test-runs";

  const { db } = await import("../db");
  const { migrate } = await import("drizzle-orm/bun-sqlite/migrator");
  migrate(db, { migrationsFolder: "./drizzle" });

  const mod = await import("../index");
  app = mod.default;
});

afterAll(() => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      unlinkSync(TEST_DB_PATH + suffix);
    } catch {}
  }
});

const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

let cookie: string;
const authed = (init: RequestInit = {}) => ({
  ...init,
  headers: { ...init.headers, cookie },
});

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("Unauthenticated requests", () => {
  it("GET /api/projects 401s without a session", async () => {
    const res = await app.request("/api/projects");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("POST /api/projects 401s without a session", async () => {
    const res = await app.request("/api/projects", json({ name: "too early" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("GET /api/applications/:id 401s without a session", async () => {
    const res = await app.request(`/api/applications/${crypto.randomUUID()}`);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});

describe("Better Auth — sign-up/sign-in", () => {
  const email = "wetrack.ai.saas@gmail.com";
  const password = "correct-horse-battery-staple";

  it("signs up a new user", async () => {
    const res = await app.request("/api/auth/sign-up/email", json({ email, password, name: "Test User" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe(email);
  });

  it("signs in with the same credentials and captures the session cookie", async () => {
    const res = await app.request("/api/auth/sign-in/email", json({ email, password }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe(email);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeString();
    cookie = setCookie!.split(";")[0]!;
  });
});

describe("Projects", () => {
  let projectId: string;

  it("POST /api/projects creates a project now that a session exists", async () => {
    const res = await app.request("/api/projects", authed(json({ name: "Kuberfy" })));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Kuberfy");
    expect(body.id).toBeString();
    expect(body.ownerId).toBeString();
    projectId = body.id;
  });

  it("GET /api/projects lists only this user's projects", async () => {
    const res = await app.request("/api/projects", authed());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((p: { id: string }) => p.id === projectId)).toBe(true);
  });

  it("GET /api/projects/:id finds it", async () => {
    const res = await app.request(`/api/projects/${projectId}`, authed());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(projectId);
  });

  it("GET /api/projects/:id 404s for an unknown id with a consistent error shape", async () => {
    const res = await app.request(`/api/projects/${crypto.randomUUID()}`, authed());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Project not found" });
  });

  it("GET /api/projects/:id/applications lists an empty array before any application exists", async () => {
    const res = await app.request(`/api/projects/${projectId}/applications`, authed());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("GET /api/projects/:id/applications 404s for an unknown project id", async () => {
    const res = await app.request(`/api/projects/${crypto.randomUUID()}/applications`, authed());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Project not found" });
  });

  describe("Applications", () => {
    let applicationId: string;

    it("POST /api/applications creates an application under the project", async () => {
      const res = await app.request(
        "/api/applications",
        authed(
          json({
            projectId,
            name: "api",
            repoUrl: "https://github.com/kuberfy/api.git",
            buildType: "nixpacks",
          }),
        ),
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe("api");
      expect(body.projectId).toBe(projectId);
      expect(body.branch).toBe("main");
      applicationId = body.id;
    });

    it("GET /api/projects/:id/applications now lists it", async () => {
      const res = await app.request(`/api/projects/${projectId}/applications`, authed());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.some((a: { id: string }) => a.id === applicationId)).toBe(true);
    });

    it("GET /api/applications/:id returns it with empty deployments/domains relations", async () => {
      const res = await app.request(`/api/applications/${applicationId}`, authed());
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.id).toBe(applicationId);
      expect(body.deployments).toEqual([]);
      expect(body.domains).toEqual([]);
    });

    it("GET /api/applications/:id 404s for an unknown id", async () => {
      const res = await app.request(`/api/applications/${crypto.randomUUID()}`, authed());
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Application not found" });
    });

    it("PATCH /api/applications/:id updates it", async () => {
      const res = await app.request(
        `/api/applications/${applicationId}`,
        authed({
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "api-renamed" }),
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.name).toBe("api-renamed");
    });

    it("PATCH /api/applications/:id 404s for an unknown id", async () => {
      const res = await app.request(
        `/api/applications/${crypto.randomUUID()}`,
        authed({
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: "nope" }),
        }),
      );
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Application not found" });
    });
  });
});

describe("Unmatched routes", () => {
  it("GET /api/nope 404s with the app.notFound() shape", async () => {
    const res = await app.request("/api/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });
});
