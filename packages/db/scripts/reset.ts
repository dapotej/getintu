// Drops and recreates the public schema, then migrates and seeds. Refuses to run against
// anything but a local database.
import { createDb, databaseUrl } from "../src/client.ts";

const url = databaseUrl();
const host = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "postgres"].includes(host)) {
  throw new Error(`Refusing to reset a non-local database (${host}).`);
}
const { sql } = createDb(url, { max: 1 });
await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
await sql.end();
await import("./migrate.ts");
await import("./seed.ts");
