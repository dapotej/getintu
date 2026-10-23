import { Hono } from "hono";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { one, schema, type Db } from "@intu/db";
import { ROLE_PERMISSIONS } from "../auth/permissions.ts";
import { requirePermission, type AdminEnv } from "../auth/staff.ts";
import type { AuthAdmin } from "../auth/supabase-admin.ts";
import { body, fail } from "../http.ts";
import { staffAudit } from "./audited.ts";
import { idParam } from "./validation.ts";

const { staffUsers } = schema;

// Admin console roles. Venue staff and managers are added from the partner portal (milestone 4).
const teamRole = z.enum(["founder", "ops_lead", "ops", "concierge", "finance", "partnerships"]);
const Invite = z.object({ email: z.email().toLowerCase(), fullName: z.string().min(2).max(200), role: teamRole });
const Update = z.object({ role: teamRole, active: z.boolean(), fullName: z.string().min(2).max(200), canApprovePayouts: z.boolean() }).partial();

const publicStaff = ({ pinHash: _p, totpSecretEncrypted: _t, ...s }: typeof staffUsers.$inferSelect) => s;

export function staffRoutes(deps: { db: Db; authAdmin: AuthAdmin; inviteRedirectUrl?: string | undefined }) {
  const { db } = deps;
  const app = new Hono<AdminEnv>();

  app.get("/me", (c) => {
    const staff = c.get("staff");
    return c.json({ staff, permissions: ROLE_PERMISSIONS[staff.role] });
  });

  app.get("/staff", requirePermission("staff.manage"), async (c) => {
    const rows = await db.select().from(staffUsers).where(and(isNull(staffUsers.partnerId), isNull(staffUsers.deletedAt))).orderBy(asc(staffUsers.fullName));
    return c.json({ staff: rows.map(publicStaff) });
  });

  // Sends a Supabase invitation email; the person sets a password and enrols two-step on first sign-in.
  app.post("/staff", requirePermission("staff.manage"), async (c) => {
    const input = await body(c, Invite);
    const staff = c.get("staff");
    const [dup] = await db.select({ id: staffUsers.id }).from(staffUsers).where(eq(staffUsers.email, input.email));
    if (dup) fail(409, "duplicate_email", "Someone with this email is already on the team");
    const authUser = await deps.authAdmin.inviteUser(input.email, deps.inviteRedirectUrl);
    const row = await db.transaction(async (tx) => {
      const created = one(await tx.insert(staffUsers).values({ ...input, authUserId: authUser.id }).returning());
      await staffAudit(tx, staff, "staff.invited", "staff_user", created.id, null, publicStaff(created));
      return created;
    });
    return c.json({ staff: publicStaff(row) }, 201);
  });

  app.patch("/staff/:id", requirePermission("staff.manage"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, Update);
    const staff = c.get("staff");
    if (id === staff.id && (input.active === false || (input.role && input.role !== staff.role) || (input.canApprovePayouts !== undefined && input.canApprovePayouts !== staff.canApprovePayouts))) {
      fail(409, "cannot_change_self", "Ask another team lead to change your own role or access");
    }
    const row = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(staffUsers).where(and(eq(staffUsers.id, id), isNull(staffUsers.partnerId))).for("update");
      if (!before) fail(404, "not_found", "Staff member not found");
      const after = one(await tx.update(staffUsers).set(input).where(eq(staffUsers.id, id)).returning());
      await staffAudit(tx, staff, "staff.updated", "staff_user", id, publicStaff(before), publicStaff(after));
      return { before, after: after };
    });
    // Deactivating also stops them signing in to Supabase at all.
    if (row.before.active && row.after.active === false && row.after.authUserId) await deps.authAdmin.banUser(row.after.authUserId);
    return c.json({ staff: publicStaff(row.after) });
  });

  return app;
}
