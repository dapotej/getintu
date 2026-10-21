import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, databaseUrl } from "../src/client.ts";

const url = databaseUrl();
const { db, sql } = createDb(url, { max: 1 });
try {
  await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  console.log("Migrations applied.");
} catch (err) {
  // Say what went wrong without ever printing the connection string or password.
  const { hostname, port, username } = new URL(url);
  const e = err as { code?: string; message?: string; cause?: { code?: string; message?: string } };
  const detail = [e.code ?? e.cause?.code, (e.cause?.message ?? e.message ?? String(err)).split(url).join("<database url>")].filter(Boolean).join(": ");
  const message = `Migration failed against ${hostname}:${port || 5432} as ${username}. ${detail}`;
  console.error(message);
  if (process.env.GITHUB_ACTIONS) console.log(`::error title=Database migration failed::${message.replace(/\r?\n/g, " ")}`);
  process.exitCode = 1;
} finally {
  await sql.end();
}
