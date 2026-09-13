import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { db } from "../db";
import { env } from "../lib/env";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "sqlite", usePlural: true }),
  emailAndPassword: { enabled: true },
  plugins: [admin()],
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
});
