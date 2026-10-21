import { date, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { deletedAt, id, timestamps } from "./columns.ts";
import { currencyEnum, esimInstallStatusEnum, settlementStatusEnum } from "./enums.ts";
import { allowances, memberships } from "./memberships.ts";
import { partners } from "./partners.ts";
import { staffUsers } from "./staff.ts";

// What intu owes a partner for a period; its lines are the redemptions pointing at it.
export const settlements = pgTable("settlements", {
  id: id(),
  partnerId: uuid()
    .notNull()
    .references(() => partners.id),
  periodStart: date({ mode: "string" }).notNull(),
  periodEnd: date({ mode: "string" }).notNull(),
  totalMinor: integer().notNull(),
  currency: currencyEnum().notNull().default("NGN"),
  status: settlementStatusEnum().notNull().default("draft"),
  approvedBy: uuid().references(() => staffUsers.id),
  approvedAt: timestamp({ withTimezone: true }),
  paidAt: timestamp({ withTimezone: true }),
  paymentReference: text(),
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
