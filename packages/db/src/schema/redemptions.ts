import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { deletedAt, id, timestamps } from "./columns.ts";
import { bookingStatusEnum, declineReasonEnum, redemptionMethodEnum, redemptionResultEnum } from "./enums.ts";
import { members } from "./members.ts";
import { categories } from "./categories.ts";
import { allowances, memberships } from "./memberships.ts";
import { benefits } from "./plans.ts";
import { offers, vehicles, venues } from "./partners.ts";
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
    // The offer's service type, and the plan benefit it was checked against (null if none covered it).
    categoryId: uuid()
      .notNull()
      .references(() => categories.id),
    benefitId: uuid().references(() => benefits.id),
    allowanceId: uuid().references(() => allowances.id),
    staffUserId: uuid().references(() => staffUsers.id),
    // The car the driver picked in the scanner, for chauffeur and transfer listings.
    vehicleId: uuid().references(() => vehicles.id),
    result: redemptionResultEnum().notNull(),
    reason: declineReasonEnum(),
    method: redemptionMethodEnum().notNull(),
    partySize: integer().notNull().default(1),
    // The scanned code; one code can only ever be approved once.
    scanCode: text(),
    // Offline approvals that broke a rule once synced go to ops for review.
    flagged: boolean().notNull().default(false),
    flagReason: text(),
    // Ops closes a flag with a note once it's looked into.
    flagReviewedAt: timestamp({ withTimezone: true }),
    flagReviewedById: uuid().references(() => staffUsers.id),
    flagReviewNote: text(),
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
    // The offer booked (e.g. a 4-hour chauffeur); a scan for a visiting service must match it.
    offerId: uuid().references(() => offers.id),
    eventName: text(),
    bookingDate: date({ mode: "string" }).notNull(),
    partySize: integer().notNull().default(1),
    status: bookingStatusEnum().notNull().default("requested"),
    allowanceId: uuid().references(() => allowances.id),
    // Airport services: the flight, so the protocol partner can meet it.
    trip: jsonb().$type<{ direction: "arrival" | "departure"; flightNumber: string; time: string }>(),
    // Chauffeur and transfer listings: the car and driver the concierge assigned, shown to the member.
    vehicleId: uuid().references(() => vehicles.id),
    driverId: uuid().references(() => staffUsers.id),
    redemptionId: uuid().references(() => redemptions.id),
    notes: text(),
    ...timestamps,
  },
  (t) => [index().on(t.memberId), index().on(t.venueId, t.bookingDate)],
);
