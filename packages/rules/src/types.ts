// Inputs to the rules engine. Plain data, no database types, so the engine stays pure and
// can run in the API and (cached) in the partner app's offline mode.

export const BENEFIT_TYPES = [
  "beach_club",
  "pool_gym",
  "golf",
  "spa",
  "hosted_night",
  "lounge",
  "meet_assist",
  "guest_list",
  "priority_dining",
  "partner_meal",
  "club_visit",
  "esim_data",
] as const;
export type BenefitType = (typeof BENEFIT_TYPES)[number];

export const VENUE_TIERS = ["standard", "top"] as const;
export type VenueTier = (typeof VENUE_TIERS)[number];

export const MEMBERSHIP_STATUSES = ["pending", "active", "suspended", "ended", "cancelled"] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/** "HH:MM" in Lagos time. A close at or before open runs past midnight; close may be "24:00". */
export interface TimeWindow {
  open: string;
  close: string;
}

/** Windows per weekday, keyed "0" (Sunday) to "6" (Saturday). */
export type WeeklyHours = Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", TimeWindow[]>;

export interface MembershipInput {
  status: MembershipStatus;
  /** Lagos dates, inclusive, YYYY-MM-DD. */
  startsOn: string;
  endsOn: string;
}

export interface VenueInput {
  id: string;
  active: boolean;
  tier: VenueTier;
  openingHours: WeeklyHours;
}

export interface OfferInput {
  id: string;
  active: boolean;
  benefitType: BenefitType;
  /** Narrower hours than the venue's, if the offer has them. */
  validHours: WeeklyHours | null;
  /** Lagos dates, inclusive. */
  validFrom: string | null;
  validTo: string | null;
  /** Most approved uses of this offer per service day across all members. */
  dailyCap: number | null;
}

export interface BenefitInput {
  type: BenefitType;
  allowedVenueTiers: readonly VenueTier[];
  caps: {
    oncePerVenuePerMonth: boolean;
    oncePerVenuePerDay: boolean;
  };
  /** Draw one unit per person in the party rather than one per visit. */
  drawPerPerson: boolean;
}

export interface AllowanceInput {
  /** null means unlimited. */
  granted: number | null;
  used: number;
}

/** An earlier approved redemption by this member, used for caps and double-scan checks. */
export interface PriorRedemption {
  venueId: string;
  offerId: string;
  benefitType: BenefitType;
  serviceDate: string;
  occurredAt: Date;
}

export interface RedemptionContext {
  now: Date;
  membership: MembershipInput;
  venue: VenueInput;
  offer: OfferInput;
  /** The plan's benefit for the offer's type, or null if the plan doesn't include it. */
  benefit: BenefitInput | null;
  /** People covered by this scan, 1 or more. */
  partySize: number;
  /** The allowance covering the service date, or null if none exists. */
  allowance: AllowanceInput | null;
  /** This member's approved redemptions from at least the current Lagos month and the last 10 minutes. */
  memberHistory: readonly PriorRedemption[];
  /** Approved redemptions of this offer, by anyone, on the service date. */
  offerApprovalsOnServiceDate: number;
}

export const DECLINE_REASONS = [
  "MEMBERSHIP_NOT_ACTIVE",
  "OUTSIDE_MEMBERSHIP_DATES",
  "VENUE_INACTIVE",
  "VENUE_CLOSED",
  "OFFER_NOT_VALID_NOW",
  "BENEFIT_NOT_IN_PLAN",
  "VENUE_TIER_NOT_ALLOWED",
  "ALLOWANCE_USED_UP",
  "VENUE_MONTHLY_CAP",
  "VENUE_DAILY_LIMIT",
  "OFFER_DAILY_CAP",
  "DUPLICATE_SCAN",
] as const;
export type DeclineReason = (typeof DECLINE_REASONS)[number];

export type Decision =
  | { result: "approved"; serviceDate: string; units: number; remaining: number | null }
  | { result: "declined"; serviceDate: string; reason: Exclude<DeclineReason, "DUPLICATE_SCAN"> }
  /** A re-scan of something already claimed: staff are told it was claimed, and when. */
  | { result: "declined"; serviceDate: string; reason: "DUPLICATE_SCAN"; claimedAt: Date };
