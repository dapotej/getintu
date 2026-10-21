import { audit, type Db, type Tx } from "@intu/db";
import type { StaffContext } from "../auth/staff.ts";

/** Audit row for a change made by a staff member through the admin console. */
export function staffAudit(tx: Db | Tx, staff: StaffContext, action: string, entity: string, entityId: string, before: unknown, after: unknown) {
  return audit(tx, { type: "staff", id: staff.id }, { action, entity, entityId, before, after });
}
