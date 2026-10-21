import { eq } from "drizzle-orm";
import { allowancePeriods } from "@intu/rules";
import type { Db } from "./client.ts";
import { allowances, auditLog, benefits, memberships } from "./schema/index.ts";

export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Actor = { type: "member" | "staff" | "system"; id?: string | null };

/** Writes an audit row. Call inside the same transaction as the change it records. */
export async function audit(
  tx: Db | Tx,
  actor: Actor,
  entry: { action: string; entity: string; entityId: string; before?: unknown; after?: unknown },
) {
  await tx.insert(auditLog).values({
    actorType: actor.type,
    actorId: actor.id ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
  });
}

/**
 * Creates the allowances a membership's plan grants, one per benefit per period. Group-shared
 * benefits get one allowance for the whole Crew, created by whichever membership comes first.
 * Safe to call twice.
 */
export async function grantAllowances(tx: Db | Tx, membershipId: string, actor: Actor) {
  const [membership] = await tx.select().from(memberships).where(eq(memberships.id, membershipId));
  if (!membership) throw new Error(`Membership ${membershipId} not found`);
  const planBenefits = await tx.select().from(benefits).where(eq(benefits.planId, membership.planId));

  const created = [];
  for (const benefit of planBenefits) {
    const shared = benefit.sharedByGroup && membership.groupId !== null;
    for (const range of allowancePeriods(benefit.period, membership.startsOn, membership.endsOn)) {
      const [row] = await tx
        .insert(allowances)
        .values({
          benefitId: benefit.id,
          membershipId: shared ? null : membership.id,
          groupId: shared ? membership.groupId : null,
          periodStart: range.start,
          periodEnd: range.end,
          granted: benefit.quantity,
        })
        .onConflictDoNothing()
        .returning();
      if (row) {
        await audit(tx, actor, { action: "allowance.granted", entity: "allowance", entityId: row.id, after: row });
        created.push(row);
      }
    }
  }
  return created;
}

/** The single row an insert or update `.returning()` produced; throws if there isn't exactly one. */
export function one<T>(rows: T[]): T {
  const [row] = rows;
  if (rows.length !== 1 || row === undefined) throw new Error(`Expected one row, got ${rows.length}`);
  return row;
}
