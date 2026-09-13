import { z } from "zod";

const schema = z.object({
  DATABASE_PATH: z.string(),
  BETTER_AUTH_SECRET: z.string(),
});

export const env = schema.parse(process.env);
