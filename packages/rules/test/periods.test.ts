import { describe, expect, it } from "vitest";
import { allowancePeriods } from "../src/index.ts";

describe("allowancePeriods", () => {
  it("gives a December Pass one period for the whole pass", () => {
    expect(allowancePeriods("per_pass", "2026-12-01", "2027-01-10")).toEqual([{ start: "2026-12-01", end: "2027-01-10" }]);
  });

  it("splits by calendar month, clipping the first and last", () => {
    expect(allowancePeriods("per_month", "2027-03-15", "2027-05-10")).toEqual([
      { start: "2027-03-15", end: "2027-03-31" },
      { start: "2027-04-01", end: "2027-04-30" },
      { start: "2027-05-01", end: "2027-05-10" },
    ]);
  });

  it("handles February in a leap year", () => {
    expect(allowancePeriods("per_month", "2028-02-01", "2028-02-29")).toEqual([{ start: "2028-02-01", end: "2028-02-29" }]);
  });

  it("splits by membership year from the start date", () => {
    expect(allowancePeriods("per_year", "2027-04-01", "2029-03-31")).toEqual([
      { start: "2027-04-01", end: "2028-03-31" },
      { start: "2028-04-01", end: "2029-03-31" },
    ]);
  });

  it("returns nothing for an inverted range", () => {
    expect(allowancePeriods("per_pass", "2027-01-10", "2026-12-01")).toEqual([]);
  });
});
