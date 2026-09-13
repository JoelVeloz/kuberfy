import { createAuthClient } from "better-auth/react";
import { passkeyClient } from "@better-auth/passkey/client";
import { apiUrl } from "@/lib/api-url";

// Defaults to same-origin (empty PUBLIC_API_URL) in production; in dev, points at the API's own port — see api-url.ts.
export const authClient = createAuthClient({ baseURL: apiUrl("") || undefined, plugins: [passkeyClient()] });
