import { describe, expect, it } from "vitest";
import { costBenefit, costPlan, periodsInTerm, type CostingBenefit, type CostingPlan } from "../src/index.ts";

const pass: CostingPlan = { seasonStartsOn: "2026-12-01", seasonEndsOn: "2027-01-10", durationDays: null, groupSize: 1, overheadPerMemberMinor: 0, prices: [] };
const benefit = (extra: Partial<CostingBenefit> = {}): CostingBenefit => ({
  id: "b1",
  quantity: 4,
  period: "per_pass",
  sharedByGroup: false,
  costBasis: "per_use",
  plannedCostMinor: null,
  expectedUsePct: 60,
  offers: [],
  ...extra,
});
const offer = (rateMinor: number, placeholder = false) => ({ rateMinor, placeholder });

describe("periodsInTerm", () => {
  it("counts one period for a pass, and calendar months across a season", () => {
    expect(periodsInTerm("per_pass", pass)).toBe(1);
    expect(periodsInTerm("per_month", pass)).toBe(2);
  });

  it("counts a rolling plan's periods from a nominal start", () => {
    const annual = { seasonStartsOn: null, seasonEndsOn: null, durationDays: 365 };
    expect(periodsInTerm("per_month", annual)).toBe(12);
    expect(periodsInTerm("per_year", annual)).toBe(1);
    expect(periodsInTerm("per_month", { seasonStartsOn: null, seasonEndsOn: null, durationDays: null })).toBe(1);
  });
});

describe("costBenefit", () => {
  it("averages the offers' rates and shows their range", () => {
    const c = costBenefit(benefit({ offers: [offer(1_500_000), offer(2_200_000), offer(1_700_000, true)] }), pass);
    expect(c).toMatchObject({ uses: 4, unitCostMinor: 1_800_000, source: "offers", offerRange: { minMinor: 1_500_000, maxMinor: 2_200_000, count: 3 }, fullMinor: 7_200_000, expectedMinor: 4_320_000, placeholder: true, issue: null });
  });

  it("uses a typed planning cost over the offers", () => {
    const c = costBenefit(benefit({ plannedCostMinor: 2_000_000, offers: [offer(1_000_000, true)] }), pass);
    expect(c).toMatchObject({ unitCostMinor: 2_000_000, source: "planned", fullMinor: 8_000_000, placeholder: false });
  });

  it("uses the benefit's own expected use", () => {
    expect(costBenefit(benefit({ quantity: 1, plannedCostMinor: 10_000_000, expectedUsePct: 100 }), pass).expectedMinor).toBe(10_000_000);
  });

  it("multiplies by months, and by each person on a Crew pass unless shared", () => {
    const crew = { ...pass, groupSize: 4 };
    expect(costBenefit(benefit({ quantity: 2, period: "per_month", plannedCostMinor: 100 }), crew)).toMatchObject({ uses: 16, fullMinor: 1_600 });
    expect(costBenefit(benefit({ quantity: 1, sharedByGroup: true, plannedCostMinor: 100 }), crew)).toMatchObject({ uses: 1, fullMinor: 100 });
  });

  it("charges a flat fee per member in full, whatever the use", () => {
    expect(costBenefit(benefit({ quantity: null, costBasis: "flat_per_member", plannedCostMinor: 6_000_000, expectedUsePct: 10 }), { ...pass, groupSize: 2 })).toMatchObject({ uses: null, fullMinor: 12_000_000, expectedMinor: 12_000_000, issue: null });
  });

  it("prices an unlimited benefit at nothing when each use is free", () => {
    expect(costBenefit(benefit({ quantity: null, offers: [offer(0)] }), pass)).toMatchObject({ fullMinor: 0, expectedMinor: 0, issue: null });
  });

  it("flags an unlimited benefit that costs per use: it needs a flat fee", () => {
    expect(costBenefit(benefit({ quantity: null, offers: [offer(400_000)] }), pass)).toMatchObject({ fullMinor: null, issue: "unlimited" });
  });

  it("flags a benefit with nothing to price it from", () => {
    expect(costBenefit(benefit(), pass)).toMatchObject({ uses: 4, fullMinor: null, issue: "no_cost" });
    expect(costBenefit(benefit({ costBasis: "flat_per_member", offers: [offer(100)] }), pass)).toMatchObject({ issue: "no_cost" });
  });
});

describe("costPlan", () => {
  it("adds overheads per member and works out margins in naira at the set rates", () => {
    const plan = { ...pass, groupSize: 2, overheadPerMemberMinor: 3_000_000, prices: [{ currency: "GBP", amountMinor: 29_900 }, { currency: "USD", amountMinor: 37_900 }, { currency: "NGN", amountMinor: 50_000_000 }] };
    const c = costPlan(plan, [benefit({ plannedCostMinor: 1_000_000 }), benefit({ id: "b2", quantity: null, offers: [offer(500_000)] })], { GBP: 177_000 });
    expect(c).toMatchObject({ overheadMinor: 6_000_000, fullMinor: 14_000_000, expectedMinor: 10_800_000, complete: false });
    expect(c.margins).toEqual([
      { currency: "GBP", priceMinor: 29_900, priceNgnMinor: 52_923_000, expectedMarginMinor: 42_123_000, expectedMarginPct: 80, fullMarginMinor: 38_923_000 },
      { currency: "USD", priceMinor: 37_900, priceNgnMinor: null, expectedMarginMinor: null, expectedMarginPct: null, fullMarginMinor: null },
      { currency: "NGN", priceMinor: 50_000_000, priceNgnMinor: 50_000_000, expectedMarginMinor: 39_200_000, expectedMarginPct: 78, fullMarginMinor: 36_000_000 },
    ]);
  });
});

describe("rounding", () => {
  it("keeps planning figures to whole naira", () => {
    const c = costBenefit(benefit({ quantity: 3, offers: [offer(1_000_050), offer(2_000_000), offer(1_000_000)] }), pass);
    expect(c).toMatchObject({ unitCostMinor: 1_333_400, fullMinor: 4_000_200, expectedMinor: 2_400_100 });
  });
});
