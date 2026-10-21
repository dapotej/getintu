import { seed } from "../src/seed.ts";
import { createDb, databaseUrl } from "../src/client.ts";

const { db, sql } = createDb(databaseUrl(), { max: 1 });
const counts = await seed(db);
await sql.end();
console.log("TEST seed data loaded:", counts);
