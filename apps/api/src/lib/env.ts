import { z } from "zod";

const schema = z.object({
  DATABASE_PATH: z.string(),
  BETTER_AUTH_SECRET: z.string(),
  // comma-separated list of extra origins Better Auth must trust beyond the current kuberfyDomain (which it
  // trusts dynamically — see auth/index.ts) — e.g. the Astro dev server's own port during local development.
  CORS_ORIGINS: z
    .string()
    .min(1)
    .transform((v) => v.split(",").map((origin) => origin.trim()))
    .optional(),
  // the server's public IPv4, detected by install.sh — when set, new applications get an automatic
  // sslip.io domain (e.g. app-a1b2c3d4.203-0-113-5.sslip.io) so they're reachable with HTTPS out of the box
  SERVER_PUBLIC_IP: z.ipv4().optional(),
  // same image reference update.sh/scripts/update.ts pull from the host CLI — kept in sync so the Settings page's
  // Update button and `kuberfy update` always check/apply the exact same tag.
  KUBERFY_IMAGE: z.string().default("ghcr.io/joelveloz/kuberfy:latest"),
});

export const env = schema.parse(process.env);
