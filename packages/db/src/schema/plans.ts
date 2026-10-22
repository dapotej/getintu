import { boolean, check, date, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { categories } from "./categories.ts";
import { id, timestamps } from "./columns.ts";
import { allowancePeriodEnum, benefitCostBasisEnum, currencyEnum, venueTierEnum } from "./enums.ts";

// A product sold: December Pass Plus, Gold…
export const plans = pgTable("plans", {
  id: id(),
  code: text().notNull().unique(),
  name: text().notNull(),
  description: text(),
  // Fixed-season plans (December Pass) run between these Lagos dates…
  seasonStartsOn: date({ mode: "string" }),
  seasonEndsOn: date({ mode: "string" }),
  // …rolling plans (annual tiers) last this many days from activation.
  durationDays: integer(),
  // Sales window.
  onSaleFrom: date({ mode: "string" }),
  onSaleTo: date({ mode: "string" }),
  // Crew passes: memberships bought together share a group.
  groupSize: integer().notNull().default(1),
  // Concierge, operations and payment fees per member, in kobo, for the plan's cost and margin.
  overheadPerMemberMinor: integer().notNull().default(0),
  active: boolean().notNull().default(true),
  isTest: boolean().notNull().default(false),
  ...timestamps,
});

export const planPrices = pgTable(
  "plan_prices",
  {
    id: id(),
    planId: uuid()
      .notNull()
      .references(() => plans.id),
    currency: currencyEnum().notNull(),
    amountMinor: integer().notNull(),
    ...timestamps,
  },
  (t) => [unique().on(t.planId, t.currency)],
);

// One perk within a plan.
export const benefits = pgTable(
  "benefits",
  {
    id: id(),
    planId: uuid()
      .notNull()
      .references(() => plans.id),
    // Any level of the catalogue: a category, subcategory or single service type.
    categoryId: uuid()
      .notNull()
      .references(() => categories.id),
    // null = unlimited. Every benefit is still scanned and logged at the door.
    quantity: integer(),
    period: allowancePeriodEnum().notNull(),
    // Crew: one allowance for the whole group rather than one each.
    sharedByGroup: boolean().notNull().default(false),
    capOncePerVenuePerMonth: boolean().notNull().default(false),
    capOncePerVenuePerDay: boolean().notNull().default(true),
    // Draw one unit per person in the party (otherwise one per visit, whatever the party size).
    drawPerPerson: boolean().notNull().default(false),
    allowedVenueTiers: venueTierEnum().array().notNull().default(["standard"]),
    // Costing, for the plan's margin (packages/rules costPlan). A typed planning cost in kobo wins
    // over the average of the offers: per use, or per member for the pass when flat.
    costBasis: benefitCostBasisEnum().notNull().default("per_use"),
    plannedCostMinor: integer(),
    expectedUsePct: integer().notNull().default(60),
    ...timestamps,
  },
  (t) => [unique().on(t.planId, t.categoryId), check("benefits_expected_use_pct", sql`${t.expectedUsePct} between 0 and 100`)],
);

// Planning exchange rates for margins on foreign-currency prices, set in the console.
export const fxRates = pgTable("fx_rates", {
  currency: currencyEnum().primaryKey(),
  // Kobo per one unit of the currency: ₦1,770 to £1 is 177000.
  koboPerUnit: integer().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});
