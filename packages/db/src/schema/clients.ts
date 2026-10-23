import { date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { id, timestamps } from "./columns.ts";
import { clientInvoiceStatusEnum, currencyEnum } from "./enums.ts";
import { clientAccounts, memberships } from "./memberships.ts";
import { plans } from "./plans.ts";

// One pass a client pays for: on a plan for a period, held by one member at a time. An open seat
// (no membership) is a pass waiting for a name; removing someone ends their pass and opens it again.
export const clientSeats = pgTable(
  "client_seats",
  {
    id: id(),
    clientAccountId: uuid()
      .notNull()
      .references(() => clientAccounts.id),
    planId: uuid()
      .notNull()
      .references(() => plans.id),
    // Lagos dates, inclusive. A pass given out mid-way starts that day.
    startsOn: date({ mode: "string" }).notNull(),
    endsOn: date({ mode: "string" }).notNull(),
    membershipId: uuid().references(() => memberships.id),
    // The client's own id for the person, e.g. a bank's customer number.
    customerRef: text(),
    assignedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (t) => [index().on(t.clientAccountId), uniqueIndex("client_seats_membership").on(t.membershipId).where(sql`${t.membershipId} is not null`)],
);

// An invoice intu sent a client, recorded by hand until payments are built.
export const clientInvoices = pgTable(
  "client_invoices",
  {
    id: id(),
    clientAccountId: uuid()
      .notNull()
      .references(() => clientAccounts.id),
    number: text().notNull().unique(),
    issuedOn: date({ mode: "string" }).notNull(),
    dueOn: date({ mode: "string" }),
    amountMinor: integer().notNull(),
    currency: currencyEnum().notNull(),
    status: clientInvoiceStatusEnum().notNull().default("issued"),
    paidOn: date({ mode: "string" }),
    note: text(),
    ...timestamps,
  },
  (t) => [index().on(t.clientAccountId)],
);
