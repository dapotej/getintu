import { evaluate } from "./evaluate.ts";
import { serviceDate as serviceDateFor } from "./service-day.ts";
import type { BenefitInput, Decision, MembershipInput, OfferInput, VenueInput } from "./types.ts";

/** A visit this scanner approved while offline and hasn't synced yet. */
export interface OfflineVisit {
  membershipId: string;
  venueId: string;
  offerId: string;
  serviceDate: string;
  occurredAt: Date;
}

export interface OfflineContext {
  now: Date;
  /** From the signed pass. Its status isn't known offline, only whether it's on the revocation list. */
  membership: Omit<MembershipInput, "status"> & { id: string; revoked: boolean };
  venue: VenueInput;
  offer: OfferInput;
  /** The plan's benefit covering the offer, from the cached plans, or null. */
  benefit: BenefitInput | null;
  partySize: number;
  /** Visits stored on this scanner and not yet synced. */
  visitsOnDevice: readonly OfflineVisit[];
}

/**
 * The checks a scanner can make with no signal (spec: Offline scan flow). Allowances, monthly
 * caps and the offer's daily cap need the server, so they're checked when the visit syncs and
 * any break is flagged to ops rather than reversed at the door. To keep that risk small, offline
 * approvals are limited to one per member per venue per day.
 */
export function evaluateOffline(ctx: OfflineContext): Decision {
  const day = serviceDateFor(ctx.venue.openingHours, ctx.now);
  const mine = ctx.visitsOnDevice.filter((v) => v.membershipId === ctx.membership.id);
  const decision = evaluate({
    now: ctx.now,
    membership: { status: ctx.membership.revoked ? "suspended" : "active", startsOn: ctx.membership.startsOn, endsOn: ctx.membership.endsOn },
    venue: ctx.venue,
    offer: ctx.offer,
    benefit: ctx.benefit,
    partySize: ctx.partySize,
    // Unknown offline; checked on sync.
    allowance: { granted: null, used: 0 },
    memberHistory: ctx.benefit ? mine.map((v) => ({ ...v, benefitId: ctx.benefit?.id ?? "" })) : [],
    offerApprovalsOnServiceDate: 0,
  });
  if (decision.result === "declined") return decision;
  if (mine.some((v) => v.venueId === ctx.venue.id && v.serviceDate === day)) return { result: "declined", serviceDate: day, reason: "VENUE_DAILY_LIMIT" };
  return { ...decision, remaining: null };
}
