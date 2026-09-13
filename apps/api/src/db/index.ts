import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { env } from "../lib/env";
import * as authSchema from "./schema/auth";
import * as appSchema from "./schema/app";

const sqlite = new Database(env.DATABASE_PATH);
sqlite.exec("PRAGMA journal_mode = WAL;");
sqlite.exec("PRAGMA foreign_keys = ON;");

export const schema = { ...authSchema, ...appSchema };
export const db = drizzle(sqlite, { schema });
