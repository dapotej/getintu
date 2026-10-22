import { and, count, eq, gt, gte, isNull, lte, or, sql } from "drizzle-orm";
import { audit, schema, type Db } from "@intu/db";
import { benefitFor, evaluate, serviceDate as serviceDateFor, type Decision } from "@intu/rules";

const { allowances, benefits, bookings, categories, memberships, offers, redemptions, venues } = schema;

export interface RedeemInput {
  /** Set by an offline scanner, so a visit synced twice can only be recorded once. */
  id?: string;
  membershipId: string;
  venueId: string;
  offerId: string;
  method: "online" | "offline" | "manual";
  staffUserId?: string | null;
  partySize?: number;
  scanCode?: string | null;
  now?: Date;
  /** Flags the visit to ops whatever the rules say, e.g. an offline scan of a since-revoked device. */
  flagReason?: string | null;
}

export interface RedeemResult {
  redemptionId: string;
  decision: Decision;
  /** An offline visit that broke a rule: recorded as approved, flagged to ops with the reason. */
  flagged: boolean;
}

export class NotFoundError extends Error {}

/**
 * Records one attempt at the door. The rules engine decides; this function only gathers its
 * inputs and writes the outcome. The redemption, the allowance draw-down and their audit rows
 * commit together. Locks on the offer and the allowance serialise concurrent scans, so the
 * same code scanned twice at once produces exactly one approval.
 *
 * Offline visits have already happened at the door. If the rules decline one when it syncs,
 * it's kept as approved and flagged to ops with the reason (spec: flagged rather than reversed),
 * drawing on the allowance only where there's room.
 */
export async function redeem(db: Db, input: RedeemInput): Promise<RedeemResult> {
  const now = input.now ?? new Date();
  const partySize = input.partySize ?? 1;
  if (!Number.isInteger(partySize) || partySize < 1) throw new RangeError("partySize must be a whole number of at least 1");
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

    const [offerCategory] = await tx.select({ code: categories.code }).from(categories).where(eq(categories.id, offer.categoryId));
    if (!offerCategory) throw new NotFoundError("Offer category not found");
    // The plan's most specific benefit covering the offer's category.
    const planBenefits = await tx
      .select({ benefit: benefits, categoryCode: categories.code })
      .from(benefits)
      .innerJoin(categories, eq(categories.id, benefits.categoryId))
      .where(eq(benefits.planId, membership.planId));
    const match = benefitFor(planBenefits, offerCategory.code);
    const benefit = match?.benefit;

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

    // A visiting service is used against a confirmed booking for the day (lock order: offer,
    // allowance, booking). One booking, one approved visit.
    const [booking] =
      venue.kind === "visiting"
        ? await tx
            .select()
            .from(bookings)
            .where(
              and(
                eq(bookings.membershipId, membership.id),
                eq(bookings.venueId, venue.id),
                eq(bookings.bookingDate, day),
                eq(bookings.status, "confirmed"),
                isNull(bookings.redemptionId),
                or(isNull(bookings.offerId), eq(bookings.offerId, offer.id)),
              ),
            )
            .orderBy(bookings.createdAt)
            .limit(1)
            .for("update")
        : [];

    const monthStart = `${day.slice(0, 7)}-01`;
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
    const history = await tx
      .select({
        venueId: redemptions.venueId,
        offerId: redemptions.offerId,
        benefitId: redemptions.benefitId,
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

    // A code is only ever approved once.
    const [claimed] = input.scanCode
      ? await tx.select({ occurredAt: redemptions.occurredAt }).from(redemptions).where(and(eq(redemptions.scanCode, input.scanCode), eq(redemptions.result, "approved")))
      : [];

    const decision = evaluate({
      now,
      membership: { status: membership.status, startsOn: membership.startsOn, endsOn: membership.endsOn },
      venue: { id: venue.id, active: venue.active, tier: venue.tier, openingHours: venue.openingHours },
      offer: {
        id: offer.id,
        active: offer.active,
        categoryCode: offerCategory.code,
        validHours: offer.validHours,
        validFrom: offer.validFrom,
        validTo: offer.validTo,
        dailyCap: offer.dailyCap,
      },
      benefit: match
        ? {
            id: match.benefit.id,
            categoryCode: match.categoryCode,
            allowedVenueTiers: match.benefit.allowedVenueTiers,
            caps: { oncePerVenuePerMonth: match.benefit.capOncePerVenuePerMonth, oncePerVenuePerDay: match.benefit.capOncePerVenuePerDay },
            drawPerPerson: match.benefit.drawPerPerson,
          }
        : null,
      partySize,
      allowance: allowance ? { granted: allowance.granted, used: allowance.used } : null,
      memberHistory: history.flatMap((h) => (h.benefitId ? [{ ...h, benefitId: h.benefitId }] : [])),
      offerApprovalsOnServiceDate: offerToday?.n ?? 0,
      codeClaimedAt: claimed?.occurredAt ?? null,
      booking: { required: venue.kind === "visiting", found: booking !== undefined },
    });

    const offline = input.method === "offline";
    const flagged = (offline && decision.result === "declined") || Boolean(input.flagReason);
    const approved = decision.result === "approved" || (offline && flagged);
    // What the visit draws: the rules' units, or for a flagged visit what it would have drawn if there's room.
    const units = decision.result === "approved" ? decision.units : match?.benefit.drawPerPerson ? partySize : 1;
    const draws = approved && allowance !== undefined && (decision.result === "approved" || allowance.granted === null || allowance.used + units <= allowance.granted);
    const [row] = await tx
      .insert(redemptions)
      .values({
        ...(input.id ? { id: input.id } : {}),
        occurredAt: now,
        serviceDate: decision.serviceDate,
        memberId: membership.memberId,
        membershipId: membership.id,
        venueId: venue.id,
        offerId: offer.id,
        categoryId: offer.categoryId,
        benefitId: benefit?.id ?? null,
        allowanceId: draws ? (allowance?.id ?? null) : null,
        staffUserId: input.staffUserId ?? null,
        result: approved ? "approved" : "declined",
        reason: decision.result === "declined" && !flagged ? decision.reason : null,
        method: input.method,
        partySize,
        // A flagged repeat of an approved code can't hold the code again.
        scanCode: flagged && claimed ? null : (input.scanCode ?? null),
        flagged,
        flagReason: !flagged ? null : [input.flagReason, decision.result === "declined" ? `Offline visit broke a rule: ${decision.reason}` : null].filter(Boolean).join(". "),
      })
      .returning();
    if (!row) throw new Error("Redemption insert returned nothing");
    await audit(tx, actor, { action: flagged ? "redemption.flagged" : `redemption.${decision.result}`, entity: "redemption", entityId: row.id, after: row });

    if (draws && allowance) {
      const [updated] = await tx
        .update(allowances)
        .set({ used: sql`${allowances.used} + ${units}` })
        .where(eq(allowances.id, allowance.id))
        .returning();
      await audit(tx, actor, { action: "allowance.drawn_down", entity: "allowance", entityId: allowance.id, before: allowance, after: updated });
    }

    if (approved && booking) {
      const [usedBooking] = await tx.update(bookings).set({ status: "completed", redemptionId: row.id }).where(eq(bookings.id, booking.id)).returning();
      await audit(tx, actor, { action: "booking.completed", entity: "booking", entityId: booking.id, before: booking, after: usedBooking });
    }

    return { redemptionId: row.id, decision, flagged };
  });
}
