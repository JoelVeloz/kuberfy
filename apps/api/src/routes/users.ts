import { zValidator } from "@hono/zod-validator";
import { StatusCodes } from "http-status-codes";
import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { auth } from "../auth";
import { db } from "../db";
import { passkeys, users as usersTable } from "../db/schema/auth";
import { requireAdmin, requireAuth } from "../lib/auth-middleware";
import { paginationOffset, paginationQuery } from "../lib/pagination";

export const users = new Hono();

users.use("*", requireAuth);

users.get("/", zValidator("query", paginationQuery), async (c) => {
  const pagination = c.req.valid("query");
  const [items, total, passkeyCounts] = await Promise.all([
    db
      .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name, role: usersTable.role, createdAt: usersTable.createdAt })
      .from(usersTable)
      .orderBy(desc(usersTable.createdAt))
      .limit(pagination.pageSize)
      .offset(paginationOffset(pagination)),
    db.$count(usersTable),
    db
      .select({ userId: passkeys.userId, count: sql<number>`count(*)` })
      .from(passkeys)
      .groupBy(passkeys.userId),
  ]);
  const passkeyCountByUser = new Map(passkeyCounts.map((p) => [p.userId, p.count]));
  return c.json({ items: items.map((u) => ({ ...u, passkeyCount: passkeyCountByUser.get(u.id) ?? 0 })), total });
});

// Admin-only: exposes session tokens and lets an admin manage another user's passkeys/sessions, same trust
// boundary as creating a user or setting their password below.
users.get("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  const user = await db.query.users.findFirst({ where: eq(usersTable.id, id) });
  if (!user) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "User not found" });

  const [userPasskeys, sessionsResult] = await Promise.all([
    db.query.passkeys.findMany({ where: eq(passkeys.userId, id), orderBy: desc(passkeys.createdAt) }),
    auth.api.listUserSessions({ headers: c.req.raw.headers, body: { userId: id } }),
  ]);

  return c.json({ ...user, passkeys: userPasskeys, sessions: sessionsResult.sessions });
});

users.delete("/:id/sessions/:token", requireAdmin, async (c) => {
  await auth.api.revokeUserSession({ headers: c.req.raw.headers, body: { sessionToken: c.req.param("token") } });
  return c.json({ success: true });
});

users.delete("/:id/sessions", requireAdmin, async (c) => {
  await auth.api.revokeUserSessions({ headers: c.req.raw.headers, body: { userId: c.req.param("id") } });
  return c.json({ success: true });
});

users.delete("/:id/passkeys/:passkeyId", requireAdmin, async (c) => {
  const { id, passkeyId } = c.req.param();
  const deleted = await db
    .delete(passkeys)
    .where(and(eq(passkeys.id, passkeyId), eq(passkeys.userId, id)))
    .returning();
  if (deleted.length === 0) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Passkey not found" });
  return c.json({ success: true });
});

const createUserBody = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["admin", "user"]).default("user"),
});

users.post("/", requireAdmin, zValidator("json", createUserBody), async (c) => {
  const { email, password, role } = c.req.valid("json");
  try {
    const result = await auth.api.createUser({ headers: c.req.raw.headers, body: { email, password, name: email.split("@")[0]!, role } });
    return c.json(result.user, StatusCodes.CREATED);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new HTTPException(message.toLowerCase().includes("already exists") ? StatusCodes.CONFLICT : StatusCodes.BAD_REQUEST, { message });
  }
});

const setPasswordBody = z.object({ password: z.string().min(8) });

users.post("/:id/password", requireAdmin, zValidator("json", setPasswordBody), async (c) => {
  const { password } = c.req.valid("json");
  await auth.api.setUserPassword({ headers: c.req.raw.headers, body: { userId: c.req.param("id"), newPassword: password } });
  return c.json({ success: true });
});

users.delete("/:id", requireAdmin, async (c) => {
  const id = c.req.param("id");
  if (id === c.get("user").id) throw new HTTPException(StatusCodes.BAD_REQUEST, { message: "You can't delete your own account" });
  await auth.api.removeUser({ headers: c.req.raw.headers, body: { userId: id } });
  return c.json({ success: true });
});
