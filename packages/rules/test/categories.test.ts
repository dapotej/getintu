import { describe, expect, it } from "vitest";
import { benefitFor, covers, includes, isNight } from "../src/index.ts";

describe("covers", () => {
  it("matches a code, and every code beneath it", () => {
    expect(covers("C03", "C03-S01-T02")).toBe(true);
    expect(covers("C03-S01", "C03-S01-T02")).toBe(true);
    expect(covers("C03-S01-T02", "C03-S01-T02")).toBe(true);
  });

  it("doesn't match siblings or codes that only share a prefix", () => {
    expect(covers("C03-S01", "C03-S02-T01")).toBe(false);
    expect(covers("C03-S01-T02", "C03-S01-T01")).toBe(false);
    expect(covers("C0", "C03-S01")).toBe(false);
    expect(covers("C03-S1", "C03-S10-T01")).toBe(false);
  });
});

describe("benefitFor", () => {
  const plan = [
    { id: "beach", categoryCode: "C03-S01" },
    { id: "cabana", categoryCode: "C03-S01-T03" },
    { id: "water", categoryCode: "C03" },
  ];

  it("picks the most specific benefit that covers the offer", () => {
    expect(benefitFor(plan, "C03-S01-T03")?.id).toBe("cabana");
    expect(benefitFor(plan, "C03-S01-T01")?.id).toBe("beach");
    expect(benefitFor(plan, "C03-S04-T02")?.id).toBe("water");
  });

  it("returns null when nothing in the plan covers it", () => {
    expect(benefitFor(plan, "C04-S05-T01")).toBeNull();
  });
});

describe("isNight", () => {
  it("treats Nightlife & Social as night", () => {
    expect(isNight("C06-S01-T03")).toBe(true);
    expect(isNight("C03-S01")).toBe(false);
  });
});

describe("includes", () => {
  const plan = [
    { categoryCode: "C03", allowedVenueTiers: ["standard"] },
    { categoryCode: "C06-S04", allowedVenueTiers: ["standard", "top"] },
    { categoryCode: "C03-S01-T02", allowedVenueTiers: ["top"] },
  ];
  it("is true when a benefit covers the offer and opens the venue's tier", () => {
    expect(includes(plan, "C03-S01-T01", "standard")).toBe(true);
    expect(includes(plan, "C06-S04-T01", "top")).toBe(true);
  });
  it("uses the most specific benefit, as a scan does", () => {
    // The cabana benefit only opens top-tier venues, even though the beach benefit opens standard ones.
    expect(includes(plan, "C03-S01-T02", "standard")).toBe(false);
    expect(includes(plan, "C03-S01-T02", "top")).toBe(true);
  });
  it("is false for a tier the benefit doesn't open, or an offer no benefit covers", () => {
    expect(includes(plan, "C03-S02-T01", "top")).toBe(false);
    expect(includes(plan, "C04-S05-T01", "standard")).toBe(false);
    expect(includes([], "C03-S01-T01", "standard")).toBe(false);
  });
});
