import { describe, expect, it } from "vitest";
import { evaluateOffline, type OfflineContext, type OfflineVisit, type WeeklyHours } from "../src/index.ts";

const every = (open: string, close: string): WeeklyHours => Object.fromEntries(["0", "1", "2", "3", "4", "5", "6"].map((d) => [d, [{ open, close }]])) as WeeklyHours;
// Saturday 12 December 2026, 14:00 in Lagos.
const NOW = new Date("2026-12-12T13:00:00Z");

const base = (overrides: Partial<OfflineContext> = {}): OfflineContext => ({
  now: NOW,
  membership: { id: "pass-1", revoked: false, startsOn: "2026-12-01", endsOn: "2027-01-10" },
  venue: { id: "venue-beach", active: true, tier: "standard", openingHours: every("10:00", "19:00") },
  offer: { id: "offer-entry", active: true, categoryCode: "C03-S01-T01", validHours: null, validFrom: null, validTo: null, dailyCap: 5 },
  benefit: { id: "benefit-beach", categoryCode: "C03-S01", allowedVenueTiers: ["standard"], caps: { oncePerVenuePerMonth: false, oncePerVenuePerDay: false }, drawPerPerson: false },
  partySize: 1,
  visitsOnDevice: [],
  ...overrides,
});
const visit = (minutesAgo: number, extra: Partial<OfflineVisit> = {}): OfflineVisit => ({
  membershipId: "pass-1",
  venueId: "venue-beach",
  offerId: "offer-entry",
  serviceDate: "2026-12-12",
  occurredAt: new Date(NOW.getTime() - minutesAgo * 60_000),
  ...extra,
});
const reason = (ctx: OfflineContext) => {
  const d = evaluateOffline(ctx);
  return d.result === "declined" ? d.reason : null;
};

describe("evaluateOffline", () => {
  it("approves what it can check, without knowing the allowance", () => {
    expect(evaluateOffline(base())).toEqual({ result: "approved", serviceDate: "2026-12-12", units: 1, remaining: null });
  });

  it("declines a pass on the revocation list", () => {
    expect(reason(base({ membership: { ...base().membership, revoked: true } }))).toBe("MEMBERSHIP_NOT_ACTIVE");
  });

  it("still checks dates, opening hours, the plan and the venue tier", () => {
    expect(reason(base({ now: new Date("2027-01-11T13:00:00Z") }))).toBe("OUTSIDE_MEMBERSHIP_DATES");
    expect(reason(base({ now: new Date("2026-12-12T20:00:00Z") }))).toBe("VENUE_CLOSED");
    expect(reason(base({ benefit: null }))).toBe("BENEFIT_NOT_IN_PLAN");
    expect(reason(base({ venue: { ...base().venue, tier: "top" } }))).toBe("VENUE_TIER_NOT_ALLOWED");
  });

  it("needs a cached booking for a visiting service", () => {
    expect(reason(base({ booking: { required: true, found: false } }))).toBe("BOOKING_REQUIRED");
    expect(reason(base({ booking: { required: true, found: true } }))).toBeNull();
  });

  it("calls a re-scan within 10 minutes already claimed", () => {
    expect(evaluateOffline(base({ visitsOnDevice: [visit(3)] }))).toMatchObject({ reason: "DUPLICATE_SCAN", claimedAt: visit(3).occurredAt });
  });

  it("allows one offline approval per member per venue per day, whatever the offer", () => {
    expect(reason(base({ visitsOnDevice: [visit(60, { offerId: "offer-cabana" })] }))).toBe("VENUE_DAILY_LIMIT");
    expect(reason(base({ visitsOnDevice: [visit(60, { venueId: "venue-other" })] }))).toBeNull();
    expect(reason(base({ visitsOnDevice: [visit(60, { membershipId: "pass-2" })] }))).toBeNull();
    expect(reason(base({ visitsOnDevice: [visit(60 * 24, { serviceDate: "2026-12-11" })] }))).toBeNull();
  });
});
