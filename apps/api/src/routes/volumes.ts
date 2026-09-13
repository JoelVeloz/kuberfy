import { zValidator } from "@hono/zod-validator";
import { StatusCodes } from "http-status-codes";
import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { db } from "../db";
import { apiCreateVolume, volume } from "../db/schema/app";
import { requireAuth } from "../lib/auth-middleware";
import { docker } from "../services/deploy";

export const volumes = new Hono();

volumes.use("*", requireAuth);

volumes.post("/", zValidator("json", apiCreateVolume), async (c) => {
  const input = c.req.valid("json");
  const existing = await db.query.volume.findFirst({
    where: and(eq(volume.applicationId, input.applicationId), eq(volume.mountPath, input.mountPath)),
  });
  if (existing) throw new HTTPException(StatusCodes.CONFLICT, { message: "This application already has a volume mounted at that path" });

  const newId = crypto.randomUUID();
  const [created] = await db
    .insert(volume)
    .values({ id: newId, ...input, volumeName: `kuberfy-vol-${newId}` })
    .returning();
  return c.json(created, StatusCodes.CREATED);
});

volumes.delete("/:id", async (c) => {
  const [deleted] = await db
    .delete(volume)
    .where(eq(volume.id, c.req.param("id")))
    .returning();
  if (!deleted) throw new HTTPException(StatusCodes.NOT_FOUND, { message: "Volume not found" });
  try {
    await docker.getVolume(deleted.volumeName).remove();
  } catch {
    // never created (app was never deployed with this volume attached) — nothing to clean up
  }
  return c.json(deleted);
});
