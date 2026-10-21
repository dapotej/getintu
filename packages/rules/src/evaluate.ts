import { openWindowDate, serviceDate as serviceDateFor } from "./service-day.ts";
import type { Decision, DeclineReason, RedemptionContext } from "./types.ts";

const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

/**
 * May this member use this offer at this venue right now? Checks run in order and the first
 * failure is the reason shown to staff. The order is the spec's, except that the 10-minute
 * duplicate check runs before the allowance and caps, so a re-scan tells staff the visit was
 * already claimed and when (Dapo, 21 Oct 2026) instead of a less helpful cap or allowance message.
 */
export function evaluate(ctx: RedemptionContext): Decision {
  const { now, membership, venue, offer, benefit, allowance } = ctx;
  const day = serviceDateFor(venue.openingHours, now);
  const decline = (reason: Exclude<DeclineReason, "DUPLICATE_SCAN">): Decision => ({ result: "declined", serviceDate: day, reason });

  // 1. Membership is active and the service day is inside its dates.
  if (membership.status !== "active") return decline("MEMBERSHIP_NOT_ACTIVE");
  if (day < membership.startsOn || day > membership.endsOn) return decline("OUTSIDE_MEMBERSHIP_DATES");

  // 2. Venue active and open; offer valid today and at this time.
  if (!venue.active) return decline("VENUE_INACTIVE");
  if (openWindowDate(venue.openingHours, now) === null) return decline("VENUE_CLOSED");
  if (
    !offer.active ||
    (offer.validFrom !== null && day < offer.validFrom) ||
    (offer.validTo !== null && day > offer.validTo) ||
    (offer.validHours !== null && openWindowDate(offer.validHours, now) === null)
  ) {
    return decline("OFFER_NOT_VALID_NOW");
  }

  // 3. Plan includes the benefit, and the venue's tier is allowed.
  if (benefit === null || benefit.type !== offer.benefitType) return decline("BENEFIT_NOT_IN_PLAN");
  if (!benefit.allowedVenueTiers.includes(venue.tier)) return decline("VENUE_TIER_NOT_ALLOWED");

  // Already claimed: the same offer approved for this member in the last 10 minutes.
  const since = now.getTime() - DUPLICATE_WINDOW_MS;
  const recent = ctx.memberHistory
    .filter((r) => r.venueId === venue.id && r.offerId === offer.id && r.occurredAt.getTime() > since)
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
  if (recent) return { result: "declined", serviceDate: day, reason: "DUPLICATE_SCAN", claimedAt: recent.occurredAt };

  // 4. Allowance remaining for the current period, enough for everyone it covers.
  const units = benefit.drawPerPerson ? ctx.partySize : 1;
  if (allowance === null || (allowance.granted !== null && allowance.used + units > allowance.granted)) {
    return decline("ALLOWANCE_USED_UP");
  }

  // 5. Caps.
  const sameVenueBenefit = ctx.memberHistory.filter((r) => r.venueId === venue.id && r.benefitType === offer.benefitType);
  const month = day.slice(0, 7);
  if (benefit.caps.oncePerVenuePerMonth && sameVenueBenefit.some((r) => r.serviceDate.slice(0, 7) === month)) {
    return decline("VENUE_MONTHLY_CAP");
  }
  if (benefit.caps.oncePerVenuePerDay && sameVenueBenefit.some((r) => r.serviceDate === day)) {
    return decline("VENUE_DAILY_LIMIT");
  }
  if (offer.dailyCap !== null && ctx.offerApprovalsOnServiceDate >= offer.dailyCap) return decline("OFFER_DAILY_CAP");

  const remaining = allowance.granted === null ? null : allowance.granted - allowance.used - units;
  return { result: "approved", serviceDate: day, units, remaining };
}
