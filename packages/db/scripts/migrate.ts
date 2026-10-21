import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, databaseUrl } from "../src/client.ts";

const { db, sql } = createDb(databaseUrl(), { max: 1 });
await migrate(db, { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
await sql.end();
console.log("Migrations applied.");
