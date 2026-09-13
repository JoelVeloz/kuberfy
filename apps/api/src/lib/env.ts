import { z } from "zod";

const schema = z.object({
  DATABASE_PATH: z.string(),
  BETTER_AUTH_SECRET: z.string(),
  BETTER_AUTH_URL: z.string().url(),
});

export const env = schema.parse(process.env);
