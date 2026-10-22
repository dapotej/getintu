// What a plan costs intu to deliver, and the margin left at each of its prices. Mirrors the unit
// economics tables in docs/CONCEPT.md: cost if every allowance is used, and cost at expected use.
// All amounts are integer minor units; naira costs are in kobo.
import { allowancePeriods, type AllowancePeriod } from "./periods.ts";
import { shiftDate } from "./service-day.ts";

/** Per use (a visit, a session), or a flat fee per member for the whole pass (unlimited gym, doctor on call). */
export type CostBasis = "per_use" | "flat_per_member";

/** Share of allowances members are assumed to use, unless a benefit says otherwise (Dapo, 22 Oct 2026). */
export const DEFAULT_EXPECTED_USE_PCT = 60;

/** Rolling plans have no fixed dates; their monthly and yearly periods are counted from this day. */
const NOMINAL_START = "2027-01-01";

export interface CostingBenefit {
  id: string;
  quantity: number | null;
  period: AllowancePeriod;
  sharedByGroup: boolean;
  costBasis: CostBasis;
  /** Typed planning cost, which wins over the offers: per use, or per member for the pass when flat. */
  plannedCostMinor: number | null;
  expectedUsePct: number;
  /** The active offers this benefit can be used at. */
  offers: readonly { rateMinor: number; placeholder: boolean }[];
}

export interface CostingPlan {
  seasonStartsOn: string | null;
  seasonEndsOn: string | null;
  durationDays: number | null;
  /** Crew passes cover several people for one price. */
  groupSize: number;
  /** Concierge, operations and payment fees, per member. */
  overheadPerMemberMinor: number;
  prices: readonly { currency: string; amountMinor: number }[];
}

/** Kobo per one unit of each foreign currency (₦1,770 to £1 is GBP: 177_000). */
export type NairaRates = Readonly<Record<string, number>>;

export type CostIssue = "no_cost" | "unlimited";

export interface BenefitCost {
  benefitId: string;
  costBasis: CostBasis;
  /** Uses across the whole pass and everyone it covers; null when unlimited or flat. */
  uses: number | null;
  /** Per use, or per member when flat. */
  unitCostMinor: number | null;
  source: "planned" | "offers" | null;
  offerRange: { minMinor: number; maxMinor: number; count: number } | null;
  fullMinor: number | null;
  expectedMinor: number | null;
  placeholder: boolean;
  /** Why this benefit has no cost: nothing to price it from, or unlimited with a cost per use. */
  issue: CostIssue | null;
}

export interface PlanMargin {
  currency: string;
  priceMinor: number;
  /** The price in kobo, or null when there's no rate for its currency. */
  priceNgnMinor: number | null;
  expectedMarginMinor: number | null;
  expectedMarginPct: number | null;
  fullMarginMinor: number | null;
}

export interface PlanCosting {
  benefits: BenefitCost[];
  overheadMinor: number;
  fullMinor: number;
  expectedMinor: number;
  /** False when a benefit couldn't be priced; the totals leave it out. */
  complete: boolean;
  placeholder: boolean;
  margins: PlanMargin[];
}

/** How many allowance periods a benefit gets over the plan's term. */
export function periodsInTerm(period: AllowancePeriod, plan: Pick<CostingPlan, "seasonStartsOn" | "seasonEndsOn" | "durationDays">): number {
  const start = plan.seasonStartsOn ?? NOMINAL_START;
  const end = plan.seasonStartsOn && plan.seasonEndsOn ? plan.seasonEndsOn : plan.durationDays ? shiftDate(start, plan.durationDays - 1) : start;
  return Math.max(1, allowancePeriods(period, start, end).length);
}

// Planning figures are kept to whole naira (100 kobo).
const toNaira = (kobo: number) => Math.round(kobo / 100) * 100;
const percentOf = (amount: number, pct: number) => toNaira((amount * pct) / 100);

export function costBenefit(b: CostingBenefit, plan: CostingPlan): BenefitCost {
  const copies = b.sharedByGroup ? 1 : plan.groupSize;
  const rates = b.offers.map((o) => o.rateMinor);
  const offerRange = rates.length ? { minMinor: Math.min(...rates), maxMinor: Math.max(...rates), count: rates.length } : null;
  const fromOffers = rates.length ? toNaira(rates.reduce((s, r) => s + r, 0) / rates.length) : null;
  const usesOffers = b.plannedCostMinor === null && b.costBasis === "per_use" && fromOffers !== null;
  const unitCostMinor = b.plannedCostMinor ?? (b.costBasis === "per_use" ? fromOffers : null);
  const base = {
    benefitId: b.id,
    costBasis: b.costBasis,
    unitCostMinor,
    source: b.plannedCostMinor !== null ? ("planned" as const) : usesOffers ? ("offers" as const) : null,
    offerRange,
    placeholder: usesOffers && b.offers.some((o) => o.placeholder),
  };
  const priced = (uses: number | null, fullMinor: number, expectedMinor: number): BenefitCost => ({ ...base, uses, fullMinor, expectedMinor, issue: null });
  const unpriced = (uses: number | null, issue: CostIssue): BenefitCost => ({ ...base, uses, fullMinor: null, expectedMinor: null, issue });

  if (unitCostMinor === null) return unpriced(b.costBasis === "per_use" && b.quantity !== null ? b.quantity * periodsInTerm(b.period, plan) * copies : null, "no_cost");
  // A flat fee is paid whether or not members use it.
  if (b.costBasis === "flat_per_member") return priced(null, unitCostMinor * copies, unitCostMinor * copies);
  // Unlimited is only affordable per use when each use is free (guest list): otherwise it needs a flat fee.
  if (b.quantity === null) return unitCostMinor === 0 ? priced(null, 0, 0) : unpriced(null, "unlimited");
  const uses = b.quantity * periodsInTerm(b.period, plan) * copies;
  const fullMinor = uses * unitCostMinor;
  return priced(uses, fullMinor, percentOf(fullMinor, b.expectedUsePct));
}

export function costPlan(plan: CostingPlan, benefits: readonly CostingBenefit[], rates: NairaRates): PlanCosting {
  const costs = benefits.map((b) => costBenefit(b, plan));
  const overheadMinor = plan.overheadPerMemberMinor * plan.groupSize;
  const sum = (key: "fullMinor" | "expectedMinor") => costs.reduce((s, c) => s + (c[key] ?? 0), overheadMinor);
  const fullMinor = sum("fullMinor");
  const expectedMinor = sum("expectedMinor");
  const margins = plan.prices.map((p): PlanMargin => {
    const rate = p.currency === "NGN" ? 100 : rates[p.currency];
    const priceNgnMinor = rate === undefined ? null : Math.round((p.amountMinor * rate) / 100);
    const expectedMarginMinor = priceNgnMinor === null ? null : priceNgnMinor - expectedMinor;
    return {
      currency: p.currency,
      priceMinor: p.amountMinor,
      priceNgnMinor,
      expectedMarginMinor,
      expectedMarginPct: priceNgnMinor && expectedMarginMinor !== null ? Math.round((expectedMarginMinor * 100) / priceNgnMinor) : null,
      fullMarginMinor: priceNgnMinor === null ? null : priceNgnMinor - fullMinor,
    };
  });
  return { benefits: costs, overheadMinor, fullMinor, expectedMinor, complete: costs.every((c) => c.issue === null), placeholder: costs.some((c) => c.placeholder), margins };
}
