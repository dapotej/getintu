// Partner statements: what goes on one, what each visit is worth, and who may approve and pay it.
// Pure functions; the API decides with them. Amounts are naira in kobo.
import { shiftDate } from "./service-day.ts";

/** A statement covers a calendar month in Lagos, "YYYY-MM". */
export function statementPeriod(month: string): { start: string; end: string } {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`Not a month: ${month}`);
  const [y, m] = month.split("-").map(Number) as [number, number];
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start: `${month}-01`, end: shiftDate(next, -1) };
}

/** The month before the one a Lagos date falls in: what the monthly run settles. */
export function previousMonth(lagosDate: string): string {
  return shiftDate(`${lagosDate.slice(0, 7)}-01`, -1).slice(0, 7);
}

/** What intu owes for one approved visit: the offer's rate, once per person when the benefit counts per person. */
export const lineAmount = (v: { rateMinor: number; partySize: number; drawPerPerson: boolean }) => v.rateMinor * (v.drawPerPerson ? Math.max(1, v.partySize) : 1);

export type NotSettleable = "not_approved" | "already_settled" | "after_period" | "flag_open" | "on_hold" | "deleted";

/**
 * Whether a visit goes on the statement for a period ending `periodEnd`. Visits synced late from
 * an earlier month join the next statement; flagged offline visits wait until ops closes the flag.
 */
export function settleable(
  v: { result: string; settlementId: string | null; serviceDate: string; flagged: boolean; flagReviewedAt: Date | string | null; settlementHoldReason: string | null; deletedAt: Date | string | null },
  periodEnd: string,
): { ok: true } | { ok: false; reason: NotSettleable } {
  if (v.deletedAt) return { ok: false, reason: "deleted" };
  if (v.result !== "approved") return { ok: false, reason: "not_approved" };
  if (v.settlementId) return { ok: false, reason: "already_settled" };
  if (v.serviceDate > periodEnd) return { ok: false, reason: "after_period" };
  if (v.flagged && !v.flagReviewedAt) return { ok: false, reason: "flag_open" };
  if (v.settlementHoldReason) return { ok: false, reason: "on_hold" };
  return { ok: true };
}

export type SettlementStatus = "draft" | "approved" | "paying" | "paid" | "failed" | "void";

/** Only a draft can have lines added, held or adjusted. */
export const editable = (status: SettlementStatus) => status === "draft";

export type CannotApprove = "not_draft" | "not_an_approver" | "changed_it_yourself" | "nothing_to_pay";

/**
 * Approving a statement for payout: someone allowed to approve payouts, who isn't the person who
 * last made or changed it, and only when intu owes something.
 */
export function approvalCheck(s: { status: SettlementStatus; totalMinor: number; changedById: string | null }, approver: { id: string; canApprovePayouts: boolean }): { ok: true } | { ok: false; reason: CannotApprove } {
  if (s.status !== "draft") return { ok: false, reason: "not_draft" };
  if (!approver.canApprovePayouts) return { ok: false, reason: "not_an_approver" };
  if (s.changedById === approver.id) return { ok: false, reason: "changed_it_yourself" };
  if (s.totalMinor <= 0) return { ok: false, reason: "nothing_to_pay" };
  return { ok: true };
}

export type CannotPay = "not_approved" | "no_bank_account" | "not_naira" | "nothing_to_pay";

/** Sending the payout: an approved statement (or one whose transfer failed), in naira, to a confirmed account. */
export function payoutCheck(s: { status: SettlementStatus; totalMinor: number; currency: string }, partner: { payoutRecipientCode: string | null }): { ok: true } | { ok: false; reason: CannotPay } {
  if (s.status !== "approved" && s.status !== "failed") return { ok: false, reason: "not_approved" };
  if (s.currency !== "NGN") return { ok: false, reason: "not_naira" };
  if (s.totalMinor <= 0) return { ok: false, reason: "nothing_to_pay" };
  if (!partner.payoutRecipientCode) return { ok: false, reason: "no_bank_account" };
  return { ok: true };
}
