import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.ts";

export function createDb(url: string, options: { max?: number; connectTimeoutSeconds?: number } = {}) {
  const sql = postgres(url, { max: options.max ?? 10, connect_timeout: options.connectTimeoutSeconds ?? 30, onnotice: () => {} });
  const db = drizzle(sql, { schema, casing: "snake_case" });
  return { db, sql };
}

export type Db = ReturnType<typeof createDb>["db"];

export function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  return url;
}
