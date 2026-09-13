import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db";
import { apiUpdateSetting, setting } from "../db/schema/app";
import { requireAuth } from "../lib/auth-middleware";

export const settings = new Hono();

settings.use("*", requireAuth);

// single-row settings: no id in the URL, there's only ever one
settings.get("/", async (c) => {
  const existing = await db.query.setting.findFirst();
  return c.json(existing ?? { id: null, kuberfyDomain: null });
});

settings.patch("/", zValidator("json", apiUpdateSetting), async (c) => {
  const input = c.req.valid("json");
  const existing = await db.query.setting.findFirst();
  if (!existing) {
    const [created] = await db.insert(setting).values(input).returning();
    return c.json(created);
  }
  const [updated] = await db
    .update(setting)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(setting.id, existing.id))
    .returning();
  return c.json(updated);
});
