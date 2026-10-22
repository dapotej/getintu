import { sql } from "drizzle-orm";
import { char, check, date, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { deletedAt, id, timestamps } from "./columns.ts";
import { membershipStatusEnum, paymentSourceEnum } from "./enums.ts";
import { members } from "./members.ts";
import { benefits, plans } from "./plans.ts";

// A company or bank buying memberships for others.
export const clientAccounts = pgTable("client_accounts", {
  id: id(),
  name: text().notNull(),
  contractRef: text(),
  seats: integer(),
  billingEmail: text(),
  ...timestamps,
  deletedAt: deletedAt(),
});

// A member on a plan for a period. Dates are Lagos dates, inclusive.
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    memberId: uuid()
      .notNull()
      .references(() => members.id),
    planId: uuid()
      .notNull()
      .references(() => plans.id),
    startsOn: date({ mode: "string" }).notNull(),
    endsOn: date({ mode: "string" }).notNull(),
    status: membershipStatusEnum().notNull().default("pending"),
    paymentSource: paymentSourceEnum().notNull().default("direct"),
    clientAccountId: uuid().references(() => clientAccounts.id),
    // Crew passes share a group id.
    groupId: uuid(),
    // Travel dates, used for airport meet-and-assist and to order the eSIM 7 days before arrival.
    arrivesOn: date({ mode: "string" }),
    departsOn: date({ mode: "string" }),
    // Pilot pass number (INTU-0001) kept for imported members.
    passNumber: text().unique(),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [index().on(t.memberId), index().on(t.groupId), check("memberships_dates", sql`${t.endsOn} >= ${t.startsOn}`)],
);

// What's left of one benefit for one period. Owned by a membership, or by a Crew group for shared benefits.
export const allowances = pgTable(
  "allowances",
  {
    id: id(),
    benefitId: uuid()
      .notNull()
      .references(() => benefits.id),
    membershipId: uuid().references(() => memberships.id),
    groupId: uuid(),
    periodStart: date({ mode: "string" }).notNull(),
    periodEnd: date({ mode: "string" }).notNull(),
    // null = unlimited.
    granted: integer(),
    used: integer().notNull().default(0),
    resetsAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique("allowances_membership_period").on(t.benefitId, t.membershipId, t.periodStart),
    unique("allowances_group_period").on(t.benefitId, t.groupId, t.periodStart),
    check("allowances_one_owner", sql`(${t.membershipId} is null) <> (${t.groupId} is null)`),
    check("allowances_used_in_range", sql`${t.used} >= 0 and (${t.granted} is null or ${t.used} <= ${t.granted})`),
    check("allowances_period", sql`${t.periodEnd} >= ${t.periodStart}`),
  ],
);

// A member's phone, holding the key that signs their rotating QR code.
export const devices = pgTable(
  "devices",
  {
    id: id(),
    memberId: uuid()
      .notNull()
      .references(() => members.id),
    publicKey: text().notNull(),
    platform: text().notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.memberId)],
);

// The 6-digit code a member reads out when the scanner's camera fails. One per pass per Lagos
// day, unique that day, checked online only.
export const passCodes = pgTable(
  "pass_codes",
  {
    id: id(),
    membershipId: uuid()
      .notNull()
      .references(() => memberships.id),
    code: char({ length: 6 }).notNull(),
    validOn: date({ mode: "string" }).notNull(),
    ...timestamps,
  },
  (t) => [unique("pass_codes_code_day").on(t.code, t.validOn), unique("pass_codes_pass_day").on(t.membershipId, t.validOn)],
);
