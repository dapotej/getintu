import { sql } from "drizzle-orm";
import { boolean, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { deletedAt, id, timestamps } from "./columns.ts";
import { benefitTypeEnum, bookingStatusEnum, declineReasonEnum, redemptionMethodEnum, redemptionResultEnum } from "./enums.ts";
import { members } from "./members.ts";
import { allowances, memberships } from "./memberships.ts";
import { offers, venues } from "./partners.ts";
import { staffUsers } from "./staff.ts";
import { settlements } from "./money.ts";

// One attempt at the door, approved or declined. Every attempt is kept.
export const redemptions = pgTable(
  "redemptions",
  {
    id: id(),
    occurredAt: timestamp({ withTimezone: true }).notNull(),
    // The Lagos date the visit counts against (a night out after midnight counts against the evening it started).
    serviceDate: date({ mode: "string" }).notNull(),
    memberId: uuid()
      .notNull()
      .references(() => members.id),
    membershipId: uuid()
      .notNull()
      .references(() => memberships.id),
    venueId: uuid()
      .notNull()
      .references(() => venues.id),
    offerId: uuid()
      .notNull()
      .references(() => offers.id),
    benefitType: benefitTypeEnum().notNull(),
    allowanceId: uuid().references(() => allowances.id),
    staffUserId: uuid().references(() => staffUsers.id),
    result: redemptionResultEnum().notNull(),
    reason: declineReasonEnum(),
    method: redemptionMethodEnum().notNull(),
    partySize: integer().notNull().default(1),
    // The scanned code; one code can only ever be approved once.
    scanCode: text(),
    // Offline approvals that broke a rule once synced go to ops for review.
    flagged: boolean().notNull().default(false),
    flagReason: text(),
    settlementId: uuid().references(() => settlements.id),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [
    index().on(t.memberId, t.serviceDate),
    index().on(t.offerId, t.serviceDate),
    index().on(t.venueId, t.occurredAt),
    uniqueIndex("redemptions_scan_code_approved").on(t.scanCode).where(sql`${t.result} = 'approved'`),
  ],
);

// A reservation made in advance; the scan on the day confirms it.
export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    memberId: uuid()
      .notNull()
      .references(() => members.id),
    membershipId: uuid().references(() => memberships.id),
    venueId: uuid().references(() => venues.id),
    eventName: text(),
    bookingDate: date({ mode: "string" }).notNull(),
    partySize: integer().notNull().default(1),
    status: bookingStatusEnum().notNull().default("requested"),
    allowanceId: uuid().references(() => allowances.id),
    redemptionId: uuid().references(() => redemptions.id),
    notes: text(),
    ...timestamps,
  },
  (t) => [index().on(t.memberId), index().on(t.venueId, t.bookingDate)],
);
