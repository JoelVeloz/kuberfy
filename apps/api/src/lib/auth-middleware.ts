import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { auth } from "../auth";

type Session = typeof auth.$Infer.Session;

export const requireAuth = createMiddleware<{ Variables: { user: Session["user"] } }>(async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) throw new HTTPException(401, { message: "Unauthorized" });
  c.set("user", session.user);
  await next();
});
