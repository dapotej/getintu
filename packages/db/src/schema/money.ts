import { sql } from "drizzle-orm";
import { boolean, date, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { deletedAt, id, timestamps } from "./columns.ts";
import { currencyEnum, esimInstallStatusEnum, settlementStatusEnum } from "./enums.ts";
import { allowances, memberships } from "./memberships.ts";
import { partners } from "./partners.ts";
import { staffUsers } from "./staff.ts";

// What intu owes a partner for a period (a monthly statement). Its lines are the redemptions
// pointing at it, each with the amount fixed when it joined; adjustments add or take off the rest.
export const settlements = pgTable(
  "settlements",
  {
    id: id(),
    partnerId: uuid()
      .notNull()
      .references(() => partners.id),
    periodStart: date({ mode: "string" }).notNull(),
    periodEnd: date({ mode: "string" }).notNull(),
    // Lines plus adjustments, kept current on every change.
    totalMinor: integer().notNull(),
    linesMinor: integer().notNull().default(0),
    lineCount: integer().notNull().default(0),
    currency: currencyEnum().notNull().default("NGN"),
    status: settlementStatusEnum().notNull().default("draft"),
    // Who last made or changed it (null for the monthly run): they can't also approve it.
    changedById: uuid().references(() => staffUsers.id),
    approvedBy: uuid().references(() => staffUsers.id),
    approvedAt: timestamp({ withTimezone: true }),
    paidById: uuid().references(() => staffUsers.id),
    paidAt: timestamp({ withTimezone: true }),
    // The bank or Paystack reference for the payout, as recorded.
    paymentReference: text(),
    // Our reference for the latest Paystack transfer (one per attempt), and Paystack's code for it.
    transferReference: text().unique(),
    transferCode: text(),
    transferAttempts: integer().notNull().default(0),
    failureReason: text(),
    voidReason: text(),
    isTest: boolean().notNull().default(false),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  // One live statement per partner per period.
  (t) => [uniqueIndex("settlements_partner_period_live").on(t.partnerId, t.periodStart).where(sql`${t.status} <> 'void' and ${t.deletedAt} is null`)],
);

// A line finance adds to a statement by hand: a flat monthly fee, a correction (negative), goodwill.
export const settlementAdjustments = pgTable("settlement_adjustments", {
  id: id(),
  settlementId: uuid()
    .notNull()
    .references(() => settlements.id),
  amountMinor: integer().notNull(),
  reason: text().notNull(),
  createdById: uuid()
    .notNull()
    .references(() => staffUsers.id),
  ...timestamps,
  deletedAt: deletedAt(),
});

// A travel eSIM ordered for a member; draws down an allowance like a redemption.
export const esimOrders = pgTable("esim_orders", {
  id: id(),
  membershipId: uuid()
    .notNull()
    .references(() => memberships.id),
  allowanceId: uuid().references(() => allowances.id),
  provider: text().notNull().default("airalo"),
  providerOrderId: text().unique(),
  planCode: text().notNull(),
  dataMb: integer().notNull(),
  days: integer().notNull(),
  iccid: text(),
  installStatus: esimInstallStatusEnum().notNull().default("ordered"),
  activatedAt: timestamp({ withTimezone: true }),
  dataUsedMb: integer(),
  costMinor: integer(),
  costCurrency: currencyEnum(),
  ...timestamps,
  deletedAt: deletedAt(),
});

// Every webhook received, keyed by the provider's event id, so a repeat delivery changes nothing.
export const webhookEvents = pgTable("webhook_events", {
  id: id(),
  provider: text().notNull(),
  eventId: text().notNull().unique(),
  payload: jsonb().notNull(),
  receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp({ withTimezone: true }),
  ...timestamps,
});
