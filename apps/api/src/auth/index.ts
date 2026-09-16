import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { expo } from "@better-auth/expo";
import { db } from "../db";
import { env } from "../lib/env";
import { getCachedKuberfyDomain } from "../lib/settings-cache";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "sqlite", usePlural: true }),
  emailAndPassword: { enabled: true },
  trustedOrigins: async () => {
    const domain = await getCachedKuberfyDomain();
    const domainOrigins = domain ? [`http://${domain}`, `https://${domain}`] : [];
    return [...domainOrigins, ...(env.CORS_ORIGINS ?? [])];
  },
  // No rpID/origin set: the plugin falls back to the current request's derived baseURL/Origin header, so it
  // stays correct across a live kuberfyDomain change (routes/settings.ts) with no restart, same as trustedOrigins above.
  plugins: [admin(), passkey({ rpName: "Kuberfy" }), expo()],
  advanced: {
    database: {
      generateId: "uuid",
    },
    // No static baseURL — derived per-request from Traefik's X-Forwarded-Host/-Proto, or from the request's own
    // origin when reached directly (e.g. the installer's fallback http://<ip>:3000).
    trustedProxyHeaders: true,
  },
});
