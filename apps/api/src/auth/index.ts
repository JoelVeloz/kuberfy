import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { db } from "../db";
import { env } from "../lib/env";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "sqlite", usePlural: true }),
  emailAndPassword: { enabled: true },
  // Resolved fresh on every request instead of a fixed array baked in at boot, so changing the domain from the
  // Settings page (routes/settings.ts) takes effect immediately — no restart. CORS_ORIGINS stays as a small
  // static supplement for local dev (e.g. apps/web's Vite dev server, whose own port stays the browser's Origin
  // header even though requests are proxied server-side).
  trustedOrigins: async () => {
    const row = await db.query.setting.findFirst();
    const domainOrigins = row?.kuberfyDomain ? [`http://${row.kuberfyDomain}`, `https://${row.kuberfyDomain}`] : [];
    return [...domainOrigins, ...(env.CORS_ORIGINS ?? [])];
  },
  plugins: [admin()],
  advanced: {
    database: {
      generateId: "uuid",
    },
    // No static baseURL — derived per-request from Traefik's X-Forwarded-Host/-Proto, or from the request's own
    // origin when reached directly (e.g. the installer's fallback http://<ip>:3000).
    trustedProxyHeaders: true,
  },
});
