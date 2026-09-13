import { zValidator } from "@hono/zod-validator";
import { StatusCodes } from "http-status-codes";
import { desc } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { auth } from "../auth";
import { db } from "../db";
import { users as usersTable } from "../db/schema/auth";
import { requireAdmin, requireAuth } from "../lib/auth-middleware";
import { paginationOffset, paginationQuery } from "../lib/pagination";

export const users = new Hono();

users.use("*", requireAuth);

users.get("/", zValidator("query", paginationQuery), async (c) => {
  const pagination = c.req.valid("query");
  const [items, total] = await Promise.all([
    db
      .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name, role: usersTable.role, createdAt: usersTable.createdAt })
      .from(usersTable)
      .orderBy(desc(usersTable.createdAt))
      .limit(pagination.pageSize)
      .offset(paginationOffset(pagination)),
    db.$count(usersTable),
  ]);
  return c.json({ items, total });
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
