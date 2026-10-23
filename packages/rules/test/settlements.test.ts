import { describe, expect, it } from "vitest";
import { approvalCheck, lineAmount, payoutCheck, previousMonth, settleable, statementPeriod } from "../src/index.ts";

describe("statement periods", () => {
  it("covers a calendar month, and the monthly run settles the month before", () => {
    expect(statementPeriod("2026-10")).toEqual({ start: "2026-10-01", end: "2026-10-31" });
    expect(statementPeriod("2027-02")).toEqual({ start: "2027-02-01", end: "2027-02-28" });
    expect(statementPeriod("2026-12")).toEqual({ start: "2026-12-01", end: "2026-12-31" });
    expect(() => statementPeriod("2026-13")).toThrow();
    expect(previousMonth("2026-11-01")).toBe("2026-10");
    expect(previousMonth("2027-01-15")).toBe("2026-12");
  });
});

describe("lineAmount", () => {
  it("pays per person only when the benefit counts per person", () => {
    expect(lineAmount({ rateMinor: 1_500_000, partySize: 3, drawPerPerson: true })).toBe(4_500_000);
    expect(lineAmount({ rateMinor: 1_500_000, partySize: 3, drawPerPerson: false })).toBe(1_500_000);
    expect(lineAmount({ rateMinor: 1_500_000, partySize: 0, drawPerPerson: true })).toBe(1_500_000);
  });
});

describe("settleable", () => {
  const visit = { result: "approved", settlementId: null, serviceDate: "2026-10-20", flagged: false, flagReviewedAt: null, settlementHoldReason: null, deletedAt: null };
  const end = "2026-10-31";
  it("takes approved visits up to the period's end, including late syncs from before it", () => {
    expect(settleable(visit, end)).toEqual({ ok: true });
    expect(settleable({ ...visit, serviceDate: "2026-09-02" }, end)).toEqual({ ok: true });
  });
  it("leaves out each kind of visit that isn't owed yet", () => {
    expect(settleable({ ...visit, result: "declined" }, end)).toEqual({ ok: false, reason: "not_approved" });
    expect(settleable({ ...visit, settlementId: "s" }, end)).toEqual({ ok: false, reason: "already_settled" });
    expect(settleable({ ...visit, serviceDate: "2026-11-01" }, end)).toEqual({ ok: false, reason: "after_period" });
    expect(settleable({ ...visit, flagged: true }, end)).toEqual({ ok: false, reason: "flag_open" });
    expect(settleable({ ...visit, flagged: true, flagReviewedAt: "2026-10-22T10:00:00Z" }, end)).toEqual({ ok: true });
    expect(settleable({ ...visit, settlementHoldReason: "Disputed" }, end)).toEqual({ ok: false, reason: "on_hold" });
    expect(settleable({ ...visit, deletedAt: "2026-10-21T10:00:00Z" }, end)).toEqual({ ok: false, reason: "deleted" });
  });
});

describe("approvalCheck", () => {
  const draft = { status: "draft" as const, totalMinor: 9_000_000, changedById: "ada" };
  const bola = { id: "bola", canApprovePayouts: true };
  it("lets a payout approver who didn't change it approve, including a statement the monthly run made", () => {
    expect(approvalCheck(draft, bola)).toEqual({ ok: true });
    expect(approvalCheck({ ...draft, changedById: null }, bola)).toEqual({ ok: true });
  });
  it("gives a reason for each refusal", () => {
    expect(approvalCheck({ ...draft, status: "approved" }, bola)).toEqual({ ok: false, reason: "not_draft" });
    expect(approvalCheck(draft, { id: "bola", canApprovePayouts: false })).toEqual({ ok: false, reason: "not_an_approver" });
    expect(approvalCheck(draft, { id: "ada", canApprovePayouts: true })).toEqual({ ok: false, reason: "changed_it_yourself" });
    expect(approvalCheck({ ...draft, totalMinor: 0 }, bola)).toEqual({ ok: false, reason: "nothing_to_pay" });
  });
});

describe("payoutCheck", () => {
  const approved = { status: "approved" as const, totalMinor: 9_000_000, currency: "NGN" };
  const account = { payoutRecipientCode: "RCP_test" };
  it("pays an approved statement, and resends one whose transfer failed", () => {
    expect(payoutCheck(approved, account)).toEqual({ ok: true });
    expect(payoutCheck({ ...approved, status: "failed" }, account)).toEqual({ ok: true });
  });
  it("gives a reason for each refusal", () => {
    expect(payoutCheck({ ...approved, status: "draft" }, account)).toEqual({ ok: false, reason: "not_approved" });
    expect(payoutCheck({ ...approved, status: "paying" }, account)).toEqual({ ok: false, reason: "not_approved" });
    expect(payoutCheck({ ...approved, currency: "GBP" }, account)).toEqual({ ok: false, reason: "not_naira" });
    expect(payoutCheck({ ...approved, totalMinor: 0 }, account)).toEqual({ ok: false, reason: "nothing_to_pay" });
    expect(payoutCheck(approved, { payoutRecipientCode: null })).toEqual({ ok: false, reason: "no_bank_account" });
  });
});
