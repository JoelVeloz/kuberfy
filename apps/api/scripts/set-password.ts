// Uses auth.$context since setUserPassword requires an admin session (see private/PLAN.md).
import { parseArgs } from "node:util";
import { auth } from "../src/auth";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    password: { type: "string" },
  },
});

const { email, password } = values;

if (!email || !password) {
  console.error("Usage: bun run scripts/set-password.ts --email <email> --password <new-password>");
  process.exit(1);
}

const ctx = await auth.$context;

const found = await ctx.internalAdapter.findUserByEmail(email);
if (!found) {
  console.error(`No user found with email ${email}`);
  process.exit(1);
}
const { user } = found;

const { minPasswordLength, maxPasswordLength } = ctx.password.config;
if (password.length < minPasswordLength || password.length > maxPasswordLength) {
  console.error(`Password must be between ${minPasswordLength} and ${maxPasswordLength} characters`);
  process.exit(1);
}

const hashedPassword = await ctx.password.hash(password);
const existingAccount = await ctx.internalAdapter.findCredentialAccount(user.id);
if (existingAccount) {
  await ctx.internalAdapter.updatePassword(user.id, hashedPassword);
} else {
  await ctx.internalAdapter.createAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: hashedPassword,
  });
}

console.log(`Password updated for ${user.email} (id: ${user.id})`);
process.exit(0);
