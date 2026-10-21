// Creates the first admin account, since nobody exists yet to invite them from the console:
//   pnpm --filter @intu/api create:founder -- --email you@getintu.com --name "Your Name"
// Supabase emails an invitation; the founder sets a password and enrols two-step on first sign-in.
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import { audit, createDb, one, schema } from "@intu/db";
import { createSupabaseAuthAdmin } from "../src/auth/supabase-admin.ts";
import { loadEnv } from "../src/env.ts";

const { values } = parseArgs({ options: { email: { type: "string" }, name: { type: "string" } } });
if (!values.email || !values.name) throw new Error("--email and --name are required");
const email = values.email.toLowerCase();

const env = loadEnv();
const { db, sql } = createDb(env.DATABASE_URL, { max: 1 });
const [existing] = await db.select().from(schema.staffUsers).where(eq(schema.staffUsers.email, email));
if (existing) {
  console.log(`${email} is already on the team (${existing.role}).`);
} else {
  const authUser = await createSupabaseAuthAdmin({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }).inviteUser(email, env.ADMIN_INVITE_REDIRECT_URL);
  await db.transaction(async (tx) => {
    const staff = one(await tx.insert(schema.staffUsers).values({ role: "founder", fullName: values.name ?? "", email, authUserId: authUser.id }).returning());
    await audit(tx, { type: "system" }, { action: "staff.invited", entity: "staff_user", entityId: staff.id, after: staff });
  });
  console.log(`Invitation sent to ${email}.`);
}
await sql.end();
