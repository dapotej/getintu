import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { deletedAt, id, timestamps } from "./columns.ts";
import { crewInviteStatusEnum, currencyEnum, orderKindEnum, orderStatusEnum, paymentProviderEnum, refundStatusEnum, subscriptionStatusEnum } from "./enums.ts";
import { members } from "./members.ts";
import { memberships } from "./memberships.ts";
import { plans } from "./plans.ts";
import { staffUsers } from "./staff.ts";

// A yearly auto-renewal with Stripe or Paystack. Each paid year is an order and a membership.
export const subscriptions = pgTable("subscriptions", {
  id: id(),
  memberId: uuid()
    .notNull()
    .references(() => members.id),
  planId: uuid()
    .notNull()
    .references(() => plans.id),
  provider: paymentProviderEnum().notNull(),
  providerSubscriptionId: text().unique(),
  providerCustomerId: text(),
  currency: currencyEnum().notNull(),
  amountMinor: integer().notNull(),
  status: subscriptionStatusEnum().notNull().default("active"),
  // The membership the latest paid year created; a renewal follows on from it.
  currentMembershipId: uuid().references(() => memberships.id),
  // The member turned auto-renew off: the pass runs to its end, then stops.
  cancelAtPeriodEnd: boolean().notNull().default(false),
  cancelledAt: timestamp({ withTimezone: true }),
  lastFailureAt: timestamp({ withTimezone: true }),
  lastFailureReason: text(),
  // Provider details needed later, e.g. Paystack's email token for cancelling.
  providerData: jsonb().$type<Record<string, string>>(),
  isTest: boolean().notNull().default(false),
  ...timestamps,
});

// One payment for a pass (or a year of one). Created before checkout; paid by a webhook.
export const orders = pgTable(
  "orders",
  {
    id: id(),
    memberId: uuid()
      .notNull()
      .references(() => members.id),
    planId: uuid()
      .notNull()
      .references(() => plans.id),
    kind: orderKindEnum().notNull().default("new"),
    currency: currencyEnum().notNull(),
    amountMinor: integer().notNull(),
    provider: paymentProviderEnum().notNull(),
    status: orderStatusEnum().notNull().default("pending"),
    // The checkout session (Stripe) or transaction reference (Paystack).
    providerRef: text().unique(),
    // What a refund is made against: the payment intent (Stripe) or transaction id (Paystack).
    providerPaymentId: text(),
    subscriptionId: uuid().references(() => subscriptions.id),
    // The pass this payment created, once paid.
    membershipId: uuid().references(() => memberships.id),
    paidAt: timestamp({ withTimezone: true }),
    failureReason: text(),
    isTest: boolean().notNull().default(false),
    ...timestamps,
    deletedAt: deletedAt(),
  },
  (t) => [index().on(t.memberId), index().on(t.status, t.createdAt), uniqueIndex("orders_membership").on(t.membershipId).where(sql`${t.membershipId} is not null`)],
);

// Money given back on an order. Above a set amount it waits for a second person to approve.
export const refunds = pgTable(
  "refunds",
  {
    id: id(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id),
    amountMinor: integer().notNull(),
    currency: currencyEnum().notNull(),
    reason: text().notNull(),
    // Ends the pass (and any auto-renewal) when the refund goes through.
    endsPass: boolean().notNull().default(false),
    status: refundStatusEnum().notNull(),
    requestedById: uuid()
      .notNull()
      .references(() => staffUsers.id),
    decidedById: uuid().references(() => staffUsers.id),
    decidedAt: timestamp({ withTimezone: true }),
    decisionNote: text(),
    providerRefundId: text().unique(),
    failureReason: text(),
    ...timestamps,
  },
  (t) => [index().on(t.orderId), index().on(t.status)],
);

// A Crew buyer inviting the rest of their crew by phone; accepting gives them a pass in the group.
export const crewInvites = pgTable(
  "crew_invites",
  {
    id: id(),
    groupId: uuid().notNull(),
    // The buyer's pass, whose dates every pass in the crew shares.
    membershipId: uuid()
      .notNull()
      .references(() => memberships.id),
    invitedByMemberId: uuid()
      .notNull()
      .references(() => members.id),
    fullName: text().notNull(),
    phone: text().notNull(),
    status: crewInviteStatusEnum().notNull().default("pending"),
    acceptedMembershipId: uuid().references(() => memberships.id),
    ...timestamps,
  },
  (t) => [index().on(t.phone), uniqueIndex("crew_invites_open").on(t.groupId, t.phone).where(sql`${t.status} <> 'cancelled'`)],
);
