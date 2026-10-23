import { describe, expect, it } from "vitest";
import { defaultCurrency, holdsPlan, passTerms, providerFor, refundable, refundNeedsApproval, renewalTerms, saleStatus } from "../src/index.ts";

const december = { active: true, seasonStartsOn: "2026-12-01", seasonEndsOn: "2027-01-10", durationDays: null, onSaleFrom: "2026-10-01", onSaleTo: "2027-01-05" };
const annual = { active: true, seasonStartsOn: null, seasonEndsOn: null, durationDays: 365, onSaleFrom: null, onSaleTo: null };

describe("providerFor", () => {
  it("takes naira through Paystack and pounds and dollars through Stripe", () => {
    expect(providerFor("NGN")).toBe("paystack");
    expect(providerFor("GBP")).toBe("stripe");
    expect(providerFor("USD")).toBe("stripe");
  });
});

describe("defaultCurrency", () => {
  it("goes by country, else the phone number", () => {
    expect(defaultCurrency({ country: "NG", phone: "+447700900001" })).toBe("NGN");
    expect(defaultCurrency({ country: "gb", phone: "+2348012345678" })).toBe("GBP");
    expect(defaultCurrency({ country: null, phone: "+2348012345678" })).toBe("NGN");
    expect(defaultCurrency({ country: null, phone: "+447700900001" })).toBe("GBP");
    expect(defaultCurrency({ country: "US", phone: "+12025550123" })).toBe("USD");
  });
});

describe("saleStatus", () => {
  it("sells within the window and before the season ends", () => {
    expect(saleStatus(december, "2026-10-23")).toEqual({ onSale: true });
    expect(saleStatus(december, "2026-09-30")).toEqual({ onSale: false, reason: "not_yet_on_sale" });
    expect(saleStatus(december, "2027-01-06")).toEqual({ onSale: false, reason: "sale_ended" });
    expect(saleStatus({ ...december, onSaleTo: null }, "2027-01-11")).toEqual({ onSale: false, reason: "season_over" });
    expect(saleStatus({ ...december, active: false }, "2026-10-23")).toEqual({ onSale: false, reason: "inactive" });
    expect(saleStatus({ ...annual, durationDays: null }, "2026-10-23")).toEqual({ onSale: false, reason: "no_dates" });
  });
});

describe("passTerms", () => {
  it("runs a season pass for the season, from today once it has started", () => {
    expect(passTerms(december, "2026-10-23")).toEqual({ startsOn: "2026-12-01", endsOn: "2027-01-10", renews: false });
    expect(passTerms(december, "2026-12-20")).toEqual({ startsOn: "2026-12-20", endsOn: "2027-01-10", renews: false });
  });
  it("runs a rolling plan its length from today, and renews it", () => {
    expect(passTerms(annual, "2026-10-23")).toEqual({ startsOn: "2026-10-23", endsOn: "2027-10-22", renews: true });
    expect(renewalTerms(annual, "2027-10-22")).toEqual({ startsOn: "2027-10-23", endsOn: "2028-10-21" });
  });
});

describe("refunds", () => {
  it("needs a second person above ₦150,000, £75 or $100", () => {
    expect(refundNeedsApproval(15_000_000, "NGN")).toBe(false);
    expect(refundNeedsApproval(15_000_001, "NGN")).toBe(true);
    expect(refundNeedsApproval(7_500, "GBP")).toBe(false);
    expect(refundNeedsApproval(7_501, "GBP")).toBe(true);
    expect(refundNeedsApproval(10_001, "USD")).toBe(true);
  });
  it("never refunds more than was paid, counting refunds waiting for approval", () => {
    expect(refundable(10_000, [])).toBe(10_000);
    expect(refundable(10_000, [{ amountMinor: 4_000, status: "succeeded" }, { amountMinor: 1_000, status: "awaiting_approval" }])).toBe(5_000);
    expect(refundable(10_000, [{ amountMinor: 4_000, status: "rejected" }, { amountMinor: 4_000, status: "failed" }])).toBe(10_000);
    expect(refundable(10_000, [{ amountMinor: 12_000, status: "succeeded" }])).toBe(0);
  });
});

describe("holdsPlan", () => {
  const pass = (planId: string, status: string, endsOn: string) => ({ planId, status, endsOn });
  it("counts a current or upcoming pass on the same plan, not other plans or ended ones", () => {
    expect(holdsPlan([pass("gold", "active", "2027-10-22")], "gold", "2026-10-23")).toBe(true);
    expect(holdsPlan([pass("gold", "suspended", "2027-10-22")], "gold", "2026-10-23")).toBe(true);
    expect(holdsPlan([pass("dec", "active", "2027-01-10")], "gold", "2026-10-23")).toBe(false);
    expect(holdsPlan([pass("gold", "active", "2026-10-22")], "gold", "2026-10-23")).toBe(false);
    expect(holdsPlan([pass("gold", "cancelled", "2027-10-22"), pass("gold", "ended", "2027-10-22")], "gold", "2026-10-23")).toBe(false);
  });
});
