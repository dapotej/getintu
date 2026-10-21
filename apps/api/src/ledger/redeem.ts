import { and, count, eq, gt, gte, isNull, lte, or, sql } from "drizzle-orm";
import { audit, schema, type Db } from "@intu/db";
import { evaluate, serviceDate as serviceDateFor, type Decision } from "@intu/rules";

const { allowances, benefits, memberships, offers, redemptions, venues } = schema;

export interface RedeemInput {
  membershipId: string;
  venueId: string;
  offerId: string;
  method: "online" | "offline" | "manual";
  staffUserId?: string | null;
  partySize?: number;
  scanCode?: string | null;
  now?: Date;
}

export interface RedeemResult {
  redemptionId: string;
  decision: Decision;
}

export class NotFoundError extends Error {}

/**
 * Records one attempt at the door. The rules engine decides; this function only gathers its
 * inputs and writes the outcome. The redemption, the allowance draw-down and their audit rows
 * commit together. Locks on the offer and the allowance serialise concurrent scans, so the
 * same code scanned twice at once produces exactly one approval.
 */
export async function redeem(db: Db, input: RedeemInput): Promise<RedeemResult> {
  const now = input.now ?? new Date();
  const actor = input.staffUserId ? { type: "staff" as const, id: input.staffUserId } : { type: "system" as const };

  return db.transaction(async (tx) => {
    const [membership] = await tx.select().from(memberships).where(and(eq(memberships.id, input.membershipId), isNull(memberships.deletedAt)));
    const [venue] = await tx.select().from(venues).where(and(eq(venues.id, input.venueId), isNull(venues.deletedAt)));
    // Lock order everywhere: offer, then allowance.
    const [offer] = await tx
      .select()
      .from(offers)
      .where(and(eq(offers.id, input.offerId), eq(offers.venueId, input.venueId), isNull(offers.deletedAt)))
      .for("update");
    if (!membership || !venue || !offer) throw new NotFoundError("Membership, venue or offer not found");

    const [benefit] = await tx
      .select()
      .from(benefits)
      .where(and(eq(benefits.planId, membership.planId), eq(benefits.type, offer.benefitType)));

    const day = serviceDateFor(venue.openingHours, now);

    const shared = benefit?.sharedByGroup === true && membership.groupId !== null;
    const [allowance] = benefit
      ? await tx
          .select()
          .from(allowances)
          .where(
            and(
              eq(allowances.benefitId, benefit.id),
              shared ? eq(allowances.groupId, membership.groupId ?? "") : eq(allowances.membershipId, membership.id),
              lte(allowances.periodStart, day),
              gte(allowances.periodEnd, day),
            ),
          )
          .for("update")
      : [];

    const monthStart = `${day.slice(0, 7)}-01`;
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const history = await tx
      .select({
        venueId: redemptions.venueId,
        offerId: redemptions.offerId,
        benefitType: redemptions.benefitType,
        serviceDate: redemptions.serviceDate,
        occurredAt: redemptions.occurredAt,
      })
      .from(redemptions)
      .where(
        and(
          eq(redemptions.memberId, membership.memberId),
          eq(redemptions.result, "approved"),
          isNull(redemptions.deletedAt),
          or(gte(redemptions.serviceDate, monthStart), gt(redemptions.occurredAt, tenMinutesAgo)),
        ),
      );

    const [offerToday] = await tx
      .select({ n: count() })
      .from(redemptions)
      .where(and(eq(redemptions.offerId, offer.id), eq(redemptions.serviceDate, day), eq(redemptions.result, "approved"), isNull(redemptions.deletedAt)));

    const decision = evaluate({
      now,
      membership: { status: membership.status, startsOn: membership.startsOn, endsOn: membership.endsOn },
      venue: { id: venue.id, active: venue.active, tier: venue.tier, openingHours: venue.openingHours },
      offer: {
        id: offer.id,
        active: offer.active,
        benefitType: offer.benefitType,
        validHours: offer.validHours,
        validFrom: offer.validFrom,
        validTo: offer.validTo,
        dailyCap: offer.dailyCap,
      },
      benefit: benefit
        ? {
            type: benefit.type,
            allowedVenueTiers: benefit.allowedVenueTiers,
            caps: { oncePerVenuePerMonth: benefit.capOncePerVenuePerMonth, oncePerVenuePerDay: benefit.capOncePerVenuePerDay },
          }
        : null,
      allowance: allowance ? { granted: allowance.granted, used: allowance.used } : null,
      memberHistory: history,
      offerApprovalsOnServiceDate: offerToday?.n ?? 0,
    });

    const approved = decision.result === "approved";
    const [row] = await tx
      .insert(redemptions)
      .values({
        occurredAt: now,
        serviceDate: decision.serviceDate,
        memberId: membership.memberId,
        membershipId: membership.id,
        venueId: venue.id,
        offerId: offer.id,
        benefitType: offer.benefitType,
        allowanceId: approved ? (allowance?.id ?? null) : null,
        staffUserId: input.staffUserId ?? null,
        result: decision.result,
        reason: decision.result === "declined" ? decision.reason : null,
        method: input.method,
        partySize: input.partySize ?? 1,
        scanCode: input.scanCode ?? null,
      })
      .returning();
    if (!row) throw new Error("Redemption insert returned nothing");
    await audit(tx, actor, { action: `redemption.${decision.result}`, entity: "redemption", entityId: row.id, after: row });

    if (approved && allowance) {
      const [updated] = await tx
        .update(allowances)
        .set({ used: sql`${allowances.used} + 1` })
        .where(eq(allowances.id, allowance.id))
        .returning();
      await audit(tx, actor, { action: "allowance.drawn_down", entity: "allowance", entityId: allowance.id, before: allowance, after: updated });
    }

    return { redemptionId: row.id, decision };
  });
}
