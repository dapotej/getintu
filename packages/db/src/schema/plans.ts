import { boolean, date, integer, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./columns.ts";
import { allowancePeriodEnum, benefitTypeEnum, currencyEnum, venueTierEnum } from "./enums.ts";

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
    type: benefitTypeEnum().notNull(),
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
    ...timestamps,
  },
  (t) => [unique().on(t.planId, t.type)],
);
