import { createMiddleware } from "hono/factory";
import { StatusCodes } from "http-status-codes";
import { HTTPException } from "hono/http-exception";
import { auth } from "../auth";

type Session = typeof auth.$Infer.Session;

export const requireAuth = createMiddleware<{ Variables: { user: Session["user"] } }>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) throw new HTTPException(StatusCodes.UNAUTHORIZED, { message: "Unauthorized" });
  c.set("user", session.user);
  await next();
});

// Run after requireAuth — the only thing a "user"-role account can't do is manage other users (see routes/users.ts).
export const requireAdmin = createMiddleware<{ Variables: { user: Session["user"] } }>(async (c, next) => {
  if (c.get("user")?.role !== "admin") throw new HTTPException(StatusCodes.FORBIDDEN, { message: "Admins only" });
  await next();
});
