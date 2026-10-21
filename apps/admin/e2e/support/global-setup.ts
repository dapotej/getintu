import { createDb, schema } from "@intu/db";
import { ACCOUNTS } from "./accounts";

/** Makes sure the TEST staff accounts exist and are active (the database itself is migrated and seeded by CI). */
export default async function globalSetup() {
  const { db, sql } = createDb(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/intu", { max: 1 });
  for (const a of Object.values(ACCOUNTS)) {
    if (!a.role) continue;
    await db
      .insert(schema.staffUsers)
      .values({ role: a.role, fullName: a.fullName, email: a.email, authUserId: a.authUserId, isTest: true })
      .onConflictDoUpdate({ target: schema.staffUsers.email, set: { role: a.role, active: true, authUserId: a.authUserId } });
  }
  await sql.end();
}
