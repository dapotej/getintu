import { describe, expect, it } from "vitest";
import { DECLINE_REASONS, evaluate, type DeclineReason, type RedemptionContext, type WeeklyHours } from "../src/index.ts";

const every = (open: string, close: string): WeeklyHours => ({
  "0": [{ open, close }],
  "1": [{ open, close }],
  "2": [{ open, close }],
  "3": [{ open, close }],
  "4": [{ open, close }],
  "5": [{ open, close }],
  "6": [{ open, close }],
});

// Saturday 12 December 2026, 14:00 in Lagos (13:00 UTC).
const SAT_2PM = new Date("2026-12-12T13:00:00Z");

const base = (overrides: Partial<RedemptionContext> = {}): RedemptionContext => ({
  now: SAT_2PM,
  membership: { status: "active", startsOn: "2026-12-01", endsOn: "2027-01-10" },
  venue: { id: "venue-beach", active: true, tier: "standard", openingHours: every("10:00", "19:00") },
  offer: { id: "offer-beach", active: true, categoryCode: "C03-S01-T01", validHours: null, validFrom: null, validTo: null, dailyCap: null },
  benefit: { id: "benefit-beach", categoryCode: "C03-S01", allowedVenueTiers: ["standard"], caps: { oncePerVenuePerMonth: false, oncePerVenuePerDay: true }, drawPerPerson: false },
  partySize: 1,
  allowance: { granted: 4, used: 0 },
  memberHistory: [],
  offerApprovalsOnServiceDate: 0,
  ...overrides,
});

const declinedWith = (ctx: RedemptionContext): DeclineReason | null => {
  const d = evaluate(ctx);
  return d.result === "declined" ? d.reason : null;
};

const prior = (minutesAgo: number, serviceDate = "2026-12-12", venueId = "venue-beach") => ({
  venueId,
  offerId: "offer-beach",
  benefitId: "benefit-beach",
  serviceDate,
  occurredAt: new Date(SAT_2PM.getTime() - minutesAgo * 60_000),
});

describe("evaluate: approvals", () => {
  it("approves a valid visit and reports what's left", () => {
    expect(evaluate(base())).toEqual({ result: "approved", serviceDate: "2026-12-12", units: 1, remaining: 3 });
  });

  it("approves an unlimited benefit and reports remaining as null", () => {
    expect(evaluate(base({ allowance: { granted: null, used: 57 } }))).toEqual({ result: "approved", serviceDate: "2026-12-12", units: 1, remaining: null });
  });

  it("approves an offer anywhere under the benefit's category", () => {
    const offer = { ...base().offer, categoryCode: "C03-S01-T03" };
    expect(evaluate(base({ offer })).result).toBe("approved");
    const wholeCategory = { ...base().benefit!, categoryCode: "C03" };
    expect(evaluate(base({ offer: { ...base().offer, categoryCode: "C03-S05-T01" }, benefit: wholeCategory })).result).toBe("approved");
  });

  it("allows the same benefit at a different venue on the same day (per-venue daily limit)", () => {
    expect(evaluate(base({ memberHistory: [prior(120, "2026-12-12", "venue-other")] })).result).toBe("approved");
  });

  it("allows the last unit of an allowance", () => {
    expect(evaluate(base({ allowance: { granted: 4, used: 3 } }))).toMatchObject({ result: "approved", remaining: 0 });
  });

  it("approves on the first and last day of the membership", () => {
    const first = new Date("2026-12-01T09:30:00Z");
    const last = new Date("2027-01-10T17:00:00Z");
    expect(evaluate(base({ now: first })).result).toBe("approved");
    expect(evaluate(base({ now: last })).result).toBe("approved");
  });
});

describe("evaluate: each decline reason", () => {
  const cases: Record<DeclineReason, RedemptionContext> = {
    MEMBERSHIP_NOT_ACTIVE: base({ membership: { status: "suspended", startsOn: "2026-12-01", endsOn: "2027-01-10" } }),
    OUTSIDE_MEMBERSHIP_DATES: base({ membership: { status: "active", startsOn: "2026-12-15", endsOn: "2027-01-10" } }),
    VENUE_INACTIVE: base({ venue: { id: "venue-beach", active: false, tier: "standard", openingHours: every("10:00", "19:00") } }),
    VENUE_CLOSED: base({ venue: { id: "venue-beach", active: true, tier: "standard", openingHours: every("16:00", "19:00") } }),
    OFFER_NOT_VALID_NOW: base({ offer: { id: "offer-beach", active: true, categoryCode: "C03-S01-T01", validHours: every("10:00", "12:00"), validFrom: null, validTo: null, dailyCap: null } }),
    BENEFIT_NOT_IN_PLAN: base({ benefit: null }),
    VENUE_TIER_NOT_ALLOWED: base({ venue: { id: "venue-beach", active: true, tier: "top", openingHours: every("10:00", "19:00") } }),
    ALLOWANCE_USED_UP: base({ allowance: { granted: 4, used: 4 } }),
    VENUE_MONTHLY_CAP: base({
      benefit: { id: "benefit-beach", categoryCode: "C03-S01", allowedVenueTiers: ["standard"], caps: { oncePerVenuePerMonth: true, oncePerVenuePerDay: true }, drawPerPerson: false },
      memberHistory: [prior(60 * 24 * 5, "2026-12-07")],
    }),
    VENUE_DAILY_LIMIT: base({ memberHistory: [prior(180)] }),
    OFFER_DAILY_CAP: base({ offer: { id: "offer-beach", active: true, categoryCode: "C03-S01-T01", validHours: null, validFrom: null, validTo: null, dailyCap: 20 }, offerApprovalsOnServiceDate: 20 }),
    DUPLICATE_SCAN: base({ memberHistory: [prior(4)] }),
    BOOKING_REQUIRED: base({ booking: { required: true, found: false } }),
  };

  it("has a case for every reason", () => {
    expect(Object.keys(cases).sort()).toEqual([...DECLINE_REASONS].sort());
  });

  for (const reason of DECLINE_REASONS) {
    it(`declines with ${reason}`, () => {
      expect(declinedWith(cases[reason])).toBe(reason);
    });
  }
});

describe("evaluate: details of each check", () => {
  it("treats pending, ended and cancelled memberships as not active", () => {
    for (const status of ["pending", "ended", "cancelled"] as const) {
      expect(declinedWith(base({ membership: { status, startsOn: "2026-12-01", endsOn: "2027-01-10" } }))).toBe("MEMBERSHIP_NOT_ACTIVE");
    }
  });

  it("declines after the membership's last day", () => {
    expect(declinedWith(base({ now: new Date("2027-01-11T12:00:00Z") }))).toBe("OUTSIDE_MEMBERSHIP_DATES");
  });

  it("declines an inactive offer, and one outside its date range", () => {
    const offer = base().offer;
    expect(declinedWith(base({ offer: { ...offer, active: false } }))).toBe("OFFER_NOT_VALID_NOW");
    expect(declinedWith(base({ offer: { ...offer, validFrom: "2026-12-20" } }))).toBe("OFFER_NOT_VALID_NOW");
    expect(declinedWith(base({ offer: { ...offer, validTo: "2026-12-11" } }))).toBe("OFFER_NOT_VALID_NOW");
  });

  it("declines when the plan's benefit doesn't cover the offer's category", () => {
    const benefit = { id: "benefit-spa", categoryCode: "C04-S05", allowedVenueTiers: ["standard" as const], caps: { oncePerVenuePerMonth: false, oncePerVenuePerDay: true }, drawPerPerson: false };
    expect(declinedWith(base({ benefit }))).toBe("BENEFIT_NOT_IN_PLAN");
  });

  it("declines when no allowance exists for the period", () => {
    expect(declinedWith(base({ allowance: null }))).toBe("ALLOWANCE_USED_UP");
  });

  it("lets the monthly cap pass in a new month", () => {
    const benefit = { id: "benefit-beach", categoryCode: "C03-S01", allowedVenueTiers: ["standard" as const], caps: { oncePerVenuePerMonth: true, oncePerVenuePerDay: true }, drawPerPerson: false };
    const jan = new Date("2027-01-03T13:00:00Z");
    expect(evaluate(base({ now: jan, benefit, memberHistory: [prior(0, "2026-12-30")] })).result).toBe("approved");
  });

  it("tells staff when a duplicate was first claimed", () => {
    const d = evaluate(base({ memberHistory: [prior(9), prior(4)] }));
    expect(d).toEqual({ result: "declined", serviceDate: "2026-12-12", reason: "DUPLICATE_SCAN", claimedAt: prior(4).occurredAt });
  });

  it("reports a re-scan as already claimed even when it used the last unit", () => {
    expect(declinedWith(base({ allowance: { granted: 1, used: 1 }, memberHistory: [prior(2)] }))).toBe("DUPLICATE_SCAN");
  });

  it("declines a code that was already approved, saying when", () => {
    const claimedAt = new Date("2026-12-12T12:59:40Z");
    expect(evaluate(base({ codeClaimedAt: claimedAt }))).toEqual({ result: "declined", serviceDate: "2026-12-12", reason: "DUPLICATE_SCAN", claimedAt });
  });

  it("approves a visiting service against a booking, and anything else without one", () => {
    expect(evaluate(base({ booking: { required: true, found: true } })).result).toBe("approved");
    expect(evaluate(base({ booking: { required: false, found: false } })).result).toBe("approved");
  });

  it("tells staff a re-scan was claimed rather than that the (now used) booking is missing", () => {
    expect(declinedWith(base({ booking: { required: true, found: false }, memberHistory: [prior(3)] }))).toBe("DUPLICATE_SCAN");
  });

  it("reports the daily limit, not a duplicate, after 10 minutes", () => {
    expect(declinedWith(base({ memberHistory: [prior(11)] }))).toBe("VENUE_DAILY_LIMIT");
  });

  it("draws one unit per person for per-person benefits", () => {
    const benefit = { ...base().benefit!, drawPerPerson: true };
    expect(evaluate(base({ benefit, partySize: 3 }))).toMatchObject({ result: "approved", units: 3, remaining: 1 });
  });

  it("declines a per-person benefit when the party is bigger than what's left", () => {
    const benefit = { ...base().benefit!, drawPerPerson: true };
    expect(declinedWith(base({ benefit, partySize: 3, allowance: { granted: 4, used: 2 } }))).toBe("ALLOWANCE_USED_UP");
  });

  it("draws one unit per visit for group benefits, whatever the party size", () => {
    expect(evaluate(base({ partySize: 4, allowance: { granted: 1, used: 0 } }))).toMatchObject({ result: "approved", units: 1, remaining: 0 });
  });

  it("runs checks in order: first failure wins", () => {
    // Suspended AND venue closed AND allowance used up: membership comes first.
    const ctx = base({
      membership: { status: "suspended", startsOn: "2026-12-01", endsOn: "2027-01-10" },
      venue: { id: "venue-beach", active: true, tier: "standard", openingHours: every("16:00", "19:00") },
      allowance: { granted: 1, used: 1 },
    });
    expect(declinedWith(ctx)).toBe("MEMBERSHIP_NOT_ACTIVE");
    // Allowance used up beats the daily limit.
    expect(declinedWith(base({ allowance: { granted: 1, used: 1 }, memberHistory: [prior(180)] }))).toBe("ALLOWANCE_USED_UP");
  });

  it("does not flag a duplicate older than 10 minutes", () => {
    const benefit = { id: "benefit-beach", categoryCode: "C03-S01", allowedVenueTiers: ["standard" as const], caps: { oncePerVenuePerMonth: false, oncePerVenuePerDay: false }, drawPerPerson: false };
    expect(evaluate(base({ benefit, memberHistory: [prior(11)] })).result).toBe("approved");
  });
});

describe("evaluate: nights that run past midnight", () => {
  const club: RedemptionContext["venue"] = {
    id: "venue-club",
    active: true,
    tier: "standard",
    openingHours: { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [{ open: "22:00", close: "04:00" }] },
  };
  const offer: RedemptionContext["offer"] = { id: "offer-club", active: true, categoryCode: "C06-S01-T03", validHours: null, validFrom: null, validTo: null, dailyCap: null };
  const benefit: RedemptionContext["benefit"] = { id: "benefit-guest", categoryCode: "C06-S01", allowedVenueTiers: ["standard"], caps: { oncePerVenuePerMonth: false, oncePerVenuePerDay: true }, drawPerPerson: false };
  // Sunday 13 December 2026, 01:30 in Lagos.
  const sunday0130 = new Date("2026-12-13T00:30:00Z");

  it("counts a 01:30 Sunday scan against Saturday night", () => {
    expect(evaluate(base({ now: sunday0130, venue: club, offer, benefit, allowance: { granted: null, used: 0 } }))).toMatchObject({ result: "approved", serviceDate: "2026-12-12" });
  });

  it("blocks a second entry the same night after midnight", () => {
    const history = [{ venueId: "venue-club", offerId: "offer-club", benefitId: "benefit-guest", serviceDate: "2026-12-12", occurredAt: new Date("2026-12-12T22:00:00Z") }];
    expect(declinedWith(base({ now: sunday0130, venue: club, offer, benefit, allowance: { granted: null, used: 1 }, memberHistory: history }))).toBe("VENUE_DAILY_LIMIT");
  });

  it("is closed at 04:30 Sunday", () => {
    expect(declinedWith(base({ now: new Date("2026-12-13T03:30:00Z"), venue: club, offer, benefit }))).toBe("VENUE_CLOSED");
  });

  it("lets a pass that ends on 10 January cover that night after midnight", () => {
    const hours = every("22:00", "04:00");
    // 01:00 on 11 January in Lagos belongs to the night of 10 January.
    const d = evaluate(base({ now: new Date("2027-01-11T00:00:00Z"), venue: { ...club, openingHours: hours }, offer, benefit }));
    expect(d).toMatchObject({ result: "approved", serviceDate: "2027-01-10" });
  });
});
