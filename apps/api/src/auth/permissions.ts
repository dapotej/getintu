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
  "bookings.manage",
  "clients.read",
  "clients.write",
  "clients.invoices",
  "payments.read",
  "payments.refund",
  "settlements.read",
  "settlements.write",
  "settlements.pay",
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
  // Clients (spec: main role Partnerships): ops add and remove a client's people; finance keeps invoices.
  ops: [...TEAM_READ, "members.write", "bookings.manage", "clients.read", "clients.write", "payments.read"],
  // Bookings are the concierge's (spec: Bookings queue, main role Concierge).
  concierge: [...TEAM_READ, "bookings.manage"],
  // Payments (spec: main role Finance): finance refunds; founder and ops lead too. A refund over the
  // set amount needs a second of them to approve.
  // Settlements (spec: main role Finance): finance prepares statements, sets partners' bank accounts
  // and pays; approving needs the person's own "can approve payouts" switch as well.
  finance: [...TEAM_READ, "clients.read", "clients.invoices", "payments.read", "payments.refund", "settlements.read", "settlements.write", "settlements.pay"],
  partnerships: [...TEAM_READ, "partners.write", "clients.read", "clients.write", "clients.invoices", "settlements.read"],
  door_staff: [],
  venue_manager: [],
};

export const can = (role: StaffRole, permission: Permission) => ROLE_PERMISSIONS[role].includes(permission);
