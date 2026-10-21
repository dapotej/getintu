import { and, eq, isNull } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { schema, type Db } from "@intu/db";
import { fail } from "../http.ts";
import { can, type Permission, type StaffRole } from "./permissions.ts";
import { InvalidTokenError, type TokenVerifier } from "./tokens.ts";

export interface StaffContext {
  id: string;
  role: StaffRole;
  fullName: string;
  email: string | null;
}

export type AdminEnv = { Variables: { staff: StaffContext } };

/**
 * Admin routes: a valid Supabase token, passed two-step verification (aal2), belonging to an
 * active intu staff member.
 */
export function requireStaff(deps: { db: Db; verify: TokenVerifier }) {
  return createMiddleware<AdminEnv>(async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) fail(401, "unauthenticated", "Sign in first");

    let claims;
    try {
      claims = await deps.verify(token);
    } catch (err) {
      if (err instanceof InvalidTokenError) fail(401, "invalid_token", "Your session is invalid or has expired");
      throw err;
    }
    if (claims.aal !== "aal2") fail(403, "two_step_required", "Complete two-step verification to continue");

    const [staff] = await deps.db
      .select()
      .from(schema.staffUsers)
      .where(and(eq(schema.staffUsers.authUserId, claims.sub), eq(schema.staffUsers.active, true), isNull(schema.staffUsers.deletedAt)));
    if (!staff || staff.partnerId !== null || staff.role === "door_staff" || staff.role === "venue_manager") {
      fail(403, "not_staff", "This account doesn't have access to the admin console");
    }
    c.set("staff", { id: staff.id, role: staff.role, fullName: staff.fullName, email: staff.email });
    await next();
  });
}

export function requirePermission(permission: Permission) {
  return createMiddleware<AdminEnv>(async (c, next) => {
    if (!can(c.get("staff").role, permission)) fail(403, "forbidden", `Your role can't do this (needs ${permission})`);
    await next();
  });
}
