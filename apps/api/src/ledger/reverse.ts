import { eq, sql } from "drizzle-orm";
import { audit, schema, type Db } from "@intu/db";

const { allowances, benefits, bookings, redemptions } = schema;

export class CannotReverseError extends Error {}

/**
 * Undoes an approved visit that didn't really happen, e.g. a booked chauffeur who never came
 * after the scan. The visit is kept, marked reversed (soft-deleted) so it isn't settled; the
 * allowance gets its units back and any booking it used is cancelled. All in one transaction,
 * each change audited.
 */
export async function reverseRedemption(db: Db, input: { redemptionId: string; reason: string; actor: { type: "staff"; id: string }; now: Date }) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(redemptions).where(eq(redemptions.id, input.redemptionId)).for("update");
    if (!before) return null;
    if (before.result !== "approved" || before.deletedAt) throw new CannotReverseError("Only an approved visit that hasn't been reversed can be reversed");
    if (before.settlementId) throw new CannotReverseError("This visit is already on a settlement statement");

    const [after] = await tx.update(redemptions).set({ deletedAt: input.now }).where(eq(redemptions.id, before.id)).returning();
    await audit(tx, input.actor, { action: "redemption.reversed", entity: "redemption", entityId: before.id, before, after: { ...after, reason: input.reason } });

    if (before.allowanceId) {
      const [benefit] = before.benefitId ? await tx.select({ drawPerPerson: benefits.drawPerPerson }).from(benefits).where(eq(benefits.id, before.benefitId)) : [];
      const units = benefit?.drawPerPerson ? before.partySize : 1;
      const [allowanceBefore] = await tx.select().from(allowances).where(eq(allowances.id, before.allowanceId)).for("update");
      const [allowanceAfter] = await tx
        .update(allowances)
        .set({ used: sql`greatest(${allowances.used} - ${units}, 0)` })
        .where(eq(allowances.id, before.allowanceId))
        .returning();
      await audit(tx, input.actor, { action: "allowance.restored", entity: "allowance", entityId: before.allowanceId, before: allowanceBefore, after: allowanceAfter });
    }

    const [booking] = await tx.select().from(bookings).where(eq(bookings.redemptionId, before.id)).for("update");
    if (booking) {
      const [bookingAfter] = await tx.update(bookings).set({ status: "cancelled", redemptionId: null }).where(eq(bookings.id, booking.id)).returning();
      await audit(tx, input.actor, { action: "booking.cancelled", entity: "booking", entityId: booking.id, before: booking, after: { ...bookingAfter, reason: input.reason } });
    }
    return after;
  });
}
