import type { schema } from "@intu/db";

export type StaffRole = (typeof schema.staffRoleEnum.enumValues)[number];

export const PERMISSIONS = [
  "members.read",
  "members.write",
  "plans.read",
  "plans.write",
  "partners.read",
  "partners.write",
  "staff.manage",
  "import.pilot",
  "audit.read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

/**
 * Who may do what in the admin console, from the spec's "Main role" column. Founder and ops lead
 * can do everything; venue staff and managers have no admin access (they use the partner app).
 * Assumption to confirm with Dapo: finance and partnerships can read members, concierge can't
 * change them.
 */
const TEAM_READ: Permission[] = ["members.read", "plans.read", "partners.read"];

export const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  founder: PERMISSIONS,
  ops_lead: PERMISSIONS,
  ops: [...TEAM_READ, "members.write"],
  concierge: TEAM_READ,
  finance: TEAM_READ,
  partnerships: [...TEAM_READ, "partners.write"],
  door_staff: [],
  venue_manager: [],
};

export const can = (role: StaffRole, permission: Permission) => ROLE_PERMISSIONS[role].includes(permission);
