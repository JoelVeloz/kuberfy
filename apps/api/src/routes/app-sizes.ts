import { Hono } from "hono";
import { appSizes } from "../lib/app-sizes";
import { requireAuth } from "../lib/auth-middleware";

export const appSizesRoute = new Hono();

appSizesRoute.use("*", requireAuth);

appSizesRoute.get("/", (c) => c.json(appSizes));
