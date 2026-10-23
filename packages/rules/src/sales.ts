// What a plan sells for and on what terms: who takes the payment, the pass's dates, whether it
// renews, and when a refund needs a second person to approve it. Pure functions; the API decides
// with them.
import { shiftDate } from "./service-day.ts";

export const CURRENCIES = ["NGN", "GBP", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];
export type PaymentProvider = "stripe" | "paystack";

/** Naira through Paystack (card, bank transfer, USSD); pounds and dollars by card through Stripe. */
export const providerFor = (currency: Currency): PaymentProvider => (currency === "NGN" ? "paystack" : "stripe");

/** The currency to offer first: naira for Nigerian numbers or country, pounds for the UK, else dollars. */
export function defaultCurrency(member: { country: string | null; phone: string }): Currency {
  const country = member.country?.toUpperCase() ?? null;
  if (country === "NG" || (!country && member.phone.startsWith("+234"))) return "NGN";
  if (country === "GB" || (!country && member.phone.startsWith("+44"))) return "GBP";
  return "USD";
}

export interface SalePlan {
  active: boolean;
  seasonStartsOn: string | null;
  seasonEndsOn: string | null;
  durationDays: number | null;
  onSaleFrom: string | null;
  onSaleTo: string | null;
}

export type NotOnSale = "inactive" | "not_yet_on_sale" | "sale_ended" | "season_over" | "no_dates";

/** Whether the plan can be bought on this Lagos date, and why not. */
export function saleStatus(plan: SalePlan, today: string): { onSale: true } | { onSale: false; reason: NotOnSale } {
  if (!plan.active) return { onSale: false, reason: "inactive" };
  if (plan.onSaleFrom && today < plan.onSaleFrom) return { onSale: false, reason: "not_yet_on_sale" };
  if (plan.onSaleTo && today > plan.onSaleTo) return { onSale: false, reason: "sale_ended" };
  if (plan.seasonEndsOn && today > plan.seasonEndsOn) return { onSale: false, reason: "season_over" };
  if (!plan.durationDays && !(plan.seasonStartsOn && plan.seasonEndsOn)) return { onSale: false, reason: "no_dates" };
  return { onSale: true };
}

/**
 * The pass bought on this Lagos date. A season pass (December Pass) runs for the season, from
 * today if bought once it has started; a rolling plan (annual tiers) runs its length from today
 * and renews automatically.
 */
export function passTerms(plan: SalePlan, today: string): { startsOn: string; endsOn: string; renews: boolean } {
  if (plan.durationDays) return { startsOn: today, endsOn: shiftDate(today, plan.durationDays - 1), renews: true };
  if (!plan.seasonStartsOn || !plan.seasonEndsOn) throw new Error("A plan needs season dates or a length");
  return { startsOn: plan.seasonStartsOn > today ? plan.seasonStartsOn : today, endsOn: plan.seasonEndsOn, renews: false };
}

/** The next year of a renewing pass: from the day after the current one ends. */
export function renewalTerms(plan: { durationDays: number | null }, currentEndsOn: string): { startsOn: string; endsOn: string } {
  if (!plan.durationDays) throw new Error("Only rolling plans renew");
  const startsOn = shiftDate(currentEndsOn, 1);
  return { startsOn, endsOn: shiftDate(startsOn, plan.durationDays - 1) };
}

/** Refunds above these, in minor units, need a second person (spec: Admin console). */
export const REFUND_APPROVAL_OVER: Readonly<Record<Currency, number>> = { NGN: 15_000_000, GBP: 7_500, USD: 10_000 };

export const refundNeedsApproval = (amountMinor: number, currency: Currency) => amountMinor > REFUND_APPROVAL_OVER[currency];

/** What's still refundable on a payment, given refunds already made or waiting. */
export function refundable(paidMinor: number, refunds: readonly { amountMinor: number; status: string }[]): number {
  const taken = refunds.filter((r) => r.status !== "rejected" && r.status !== "failed").reduce((n, r) => n + r.amountMinor, 0);
  return Math.max(0, paidMinor - taken);
}
