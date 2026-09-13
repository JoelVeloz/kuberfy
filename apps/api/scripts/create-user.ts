// Creates a non-admin user (see PLAN.md for why this exists alongside `create-admin`).
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { auth } from "../src/auth";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
  },
});

const { email } = values;

if (!email) {
  console.error("Usage: bun run scripts/create-user.ts --email <email>");
  process.exit(1);
}

const name = email.split("@")[0]!;
const password = randomBytes(18).toString("base64url");

try {
  const result = await auth.api.createUser({
    body: { email, name, password },
  });
  console.log(
    `User created: ${result.user.email} — temporary password: ${password} — change it with \`bun run user:set-password -- --email ${result.user.email} --password <new-password>\``,
  );
} catch (error) {
  console.error("Failed to create user:", error instanceof Error ? error.message : error);
  process.exit(1);
}

process.exit(0);
