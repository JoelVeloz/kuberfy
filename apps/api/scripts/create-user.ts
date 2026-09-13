// Creates a user (non-admin by default); pass --role admin to bootstrap the first admin from install.sh, where the CLI's `create-admin` isn't available (no Bun in the production image).
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { auth } from "../src/auth";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    role: { type: "string" },
  },
});

const { email, role } = values;

if (!email) {
  console.error("Usage: bun run scripts/create-user.ts --email <email> [--role admin]");
  process.exit(1);
}

const name = email.split("@")[0]!;
const password = randomBytes(18).toString("base64url");

try {
  const result = await auth.api.createUser({
    body: { email, name, password, ...(role ? { role } : {}) },
  });
  console.log(
    `User created: ${result.user.email} — temporary password: ${password} — change it with \`bun run user:set-password -- --email ${result.user.email} --password <new-password>\``,
  );
} catch (error) {
  console.error("Failed to create user:", error instanceof Error ? error.message : error);
  process.exit(1);
}

process.exit(0);
