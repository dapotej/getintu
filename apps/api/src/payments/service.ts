// Money in and out: starting a checkout, turning a provider's events into passes (exactly once),
// yearly renewals, Crew invites, and refunds with a second approver above a set amount. Each change
// to an order, membership, subscription or refund commits with its audit row.
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { passTerms, providerFor, refundable, refundNeedsApproval, renewalTerms, saleStatus, toLagos, type Currency } from "@intu/rules";
import { audit, grantAllowances, one, schema, type Db, type Tx } from "@intu/db";
import { fail } from "../http.ts";
import type { PaymentEvent, Payments, SubscriptionMatch } from "./providers.ts";

const { crewInvites, memberships, members, orders, planPrices, plans, refunds, subscriptions, webhookEvents } = schema;
type Actor = { type: "member" | "staff" | "system"; id?: string | null };
const SYSTEM: Actor = { type: "system" };
const NOT_ON_SALE = {
  inactive: "This plan isn't on sale",
  not_yet_on_sale: "This plan isn't on sale yet",
  sale_ended: "Sales for this plan have closed",
  season_over: "This plan's season is over",
  no_dates: "This plan isn't ready to sell yet",
} as const;

export function paymentService(deps: { db: Db; payments: Payments; clock: () => Date }) {
  const { db, payments } = deps;
  const today = () => toLagos(deps.clock()).date;

  /** Creates the order and the provider's checkout; the member pays on the provider's page. */
  async function startCheckout(memberId: string, input: { planId: string; currency: Currency }, requestOrigin: string) {
    const apiUrl = payments.apiUrl ?? requestOrigin;
    const [member] = await db.select().from(members).where(eq(members.id, memberId));
    if (!member) fail(404, "not_found", "Member not found");
    if (!member.email) fail(422, "email_required", "Add your email for the receipt");
    const [plan] = await db.select().from(plans).where(eq(plans.id, input.planId));
    if (!plan) fail(404, "not_found", "Plan not found");
    const sale = saleStatus(plan, today());
    if (!sale.onSale) fail(422, sale.reason, NOT_ON_SALE[sale.reason]);
    const [price] = await db.select().from(planPrices).where(and(eq(planPrices.planId, plan.id), eq(planPrices.currency, input.currency)));
    if (!price) fail(422, "no_price", `This plan isn't sold in ${input.currency}`);
    const terms = passTerms(plan, today());
    const provider = payments.forCurrency(input.currency);
    const order = await db.transaction(async (tx) => {
      const row = one(await tx.insert(orders).values({ memberId, planId: plan.id, currency: input.currency, amountMinor: price.amountMinor, provider: provider.name, isTest: member.isTest || plan.isTest }).returning());
      await audit(tx, { type: "member", id: memberId }, { action: "order.created", entity: "order", entityId: row.id, after: row });
      return row;
    });
    const back = (status: string) => `${apiUrl}/payments/return?order=${order.id}&status=${status}`;
    const session = await provider.checkout({
      orderId: order.id,
      currency: input.currency,
      amountMinor: price.amountMinor,
      description: `intu ${plan.name}`,
      recurring: terms.renews,
      email: member.email,
      returnUrl: back("done"),
      cancelUrl: back("cancelled"),
      paystackPlanCode: price.paystackPlanCode,
      apiUrl,
    });
    await db.update(orders).set({ providerRef: session.providerRef }).where(eq(orders.id, order.id));
    if (session.paystackPlanCode) await db.update(planPrices).set({ paystackPlanCode: session.paystackPlanCode }).where(eq(planPrices.id, price.id));
    return { orderId: order.id, url: session.url, provider: provider.name, terms };
  }

  /** A new pass from a paid order; a Crew plan starts a group the buyer invites the others to. */
  async function createPass(tx: Tx, order: typeof orders.$inferSelect, plan: typeof plans.$inferSelect, dates: { startsOn: string; endsOn: string }, groupId: string | null) {
    const membership = one(
      await tx
        .insert(memberships)
        .values({ memberId: order.memberId, planId: plan.id, startsOn: dates.startsOn, endsOn: dates.endsOn, status: "active", paymentSource: "direct", groupId })
        .returning(),
    );
    await audit(tx, SYSTEM, { action: "membership.created", entity: "membership", entityId: membership.id, after: { ...membership, orderId: order.id } });
    await grantAllowances(tx, membership.id, SYSTEM);
    return membership;
  }

  const findSubscription = async (tx: Tx, provider: string, match: SubscriptionMatch) => {
    const where =
      "providerSubscriptionId" in match
        ? and(eq(subscriptions.provider, provider as "stripe"), eq(subscriptions.providerSubscriptionId, match.providerSubscriptionId))
        : and(eq(subscriptions.provider, provider as "stripe"), eq(subscriptions.providerCustomerId, match.providerCustomerId), sql`${subscriptions.providerData}->>'planCode' = ${match.planCode}`, ne(subscriptions.status, "cancelled"));
    const [row] = await tx.select().from(subscriptions).where(where).for("update");
    return row ?? null;
  };

  async function markPaid(tx: Tx, order: typeof orders.$inferSelect, event: Extract<PaymentEvent, { kind: "paid" }>) {
    if (order.status === "paid" || order.status === "refunded" || order.status === "partially_refunded") return;
    // The provider's amount must be ours; anything else waits for a person to look at it.
    if (event.amountMinor !== order.amountMinor || event.currency.toUpperCase() !== order.currency) {
      const after = one(await tx.update(orders).set({ status: "failed", failureReason: `Paid ${event.amountMinor} ${event.currency}, expected ${order.amountMinor} ${order.currency}` }).where(eq(orders.id, order.id)).returning());
      await audit(tx, SYSTEM, { action: "order.amount_mismatch", entity: "order", entityId: order.id, before: order, after });
      return;
    }
    const plan = one(await tx.select().from(plans).where(eq(plans.id, order.planId)));
    const terms = passTerms(plan, today());
    const membership = await createPass(tx, order, plan, terms, plan.groupSize > 1 ? crypto.randomUUID() : null);
    let subscriptionId: string | null = null;
    if (event.subscription) {
      const sub = one(
        await tx
          .insert(subscriptions)
          .values({
            memberId: order.memberId,
            planId: plan.id,
            provider: order.provider,
            providerSubscriptionId: event.subscription.providerSubscriptionId,
            providerCustomerId: event.subscription.providerCustomerId,
            currency: order.currency,
            amountMinor: order.amountMinor,
            currentMembershipId: membership.id,
            providerData: event.subscription.data ?? null,
            isTest: order.isTest,
          })
          .returning(),
      );
      await audit(tx, SYSTEM, { action: "subscription.started", entity: "subscription", entityId: sub.id, after: sub });
      subscriptionId = sub.id;
    }
    const after = one(
      await tx
        .update(orders)
        .set({ status: "paid", paidAt: deps.clock(), membershipId: membership.id, providerPaymentId: event.providerPaymentId, subscriptionId, providerRef: order.providerRef ?? event.providerRef })
        .where(eq(orders.id, order.id))
        .returning(),
    );
    await audit(tx, SYSTEM, { action: "order.paid", entity: "order", entityId: order.id, before: order, after });
  }

  /**
   * Applies one provider event. The event id is recorded in the same transaction, so a repeat
   * delivery (or a retry after a crash part-way) changes nothing twice.
   */
  async function applyEvent(provider: "stripe" | "paystack" | "test", event: PaymentEvent): Promise<"applied" | "duplicate" | "ignored"> {
    if (event.kind === "ignored") return "ignored";
    return db.transaction(async (tx) => {
      const [seen] = await tx
        .insert(webhookEvents)
        .values({ provider, eventId: `${provider}:${event.eventId}`, payload: { kind: event.kind }, processedAt: deps.clock() })
        .onConflictDoNothing()
        .returning();
      if (!seen) return "duplicate";
      switch (event.kind) {
        case "paid": {
          const [order] = await tx
            .select()
            .from(orders)
            .where(and(eq(orders.provider, provider), event.orderId ? eq(orders.id, event.orderId) : eq(orders.providerRef, event.providerRef)))
            .for("update");
          if (order) await markPaid(tx, order, event);
          break;
        }
        case "checkout_expired": {
          const [order] = await tx.select().from(orders).where(and(eq(orders.provider, provider), eq(orders.providerRef, event.providerRef))).for("update");
          if (order?.status === "pending") {
            const after = one(await tx.update(orders).set({ status: "expired" }).where(eq(orders.id, order.id)).returning());
            await audit(tx, SYSTEM, { action: "order.expired", entity: "order", entityId: order.id, before: order, after });
          }
          break;
        }
        case "subscription_started": {
          const sub = await findSubscription(tx, provider, event.match);
          if (sub) {
            const after = one(await tx.update(subscriptions).set({ providerSubscriptionId: event.providerSubscriptionId, providerData: { ...(sub.providerData ?? {}), ...(event.data ?? {}) } }).where(eq(subscriptions.id, sub.id)).returning());
            await audit(tx, SYSTEM, { action: "subscription.linked", entity: "subscription", entityId: sub.id, before: sub, after });
          }
          break;
        }
        case "renewed": {
          const sub = await findSubscription(tx, provider, event.match);
          if (!sub || !sub.currentMembershipId) break;
          const current = one(await tx.select().from(memberships).where(eq(memberships.id, sub.currentMembershipId)));
          const plan = one(await tx.select().from(plans).where(eq(plans.id, sub.planId)));
          const order = one(
            await tx
              .insert(orders)
              .values({ memberId: sub.memberId, planId: plan.id, kind: "renewal", currency: sub.currency, amountMinor: event.amountMinor, provider: sub.provider, status: "paid", providerPaymentId: event.providerPaymentId, subscriptionId: sub.id, paidAt: deps.clock(), isTest: sub.isTest })
              .returning(),
          );
          const membership = await createPass(tx, order, plan, renewalTerms(plan, current.endsOn), current.groupId);
          await tx.update(orders).set({ membershipId: membership.id }).where(eq(orders.id, order.id));
          await audit(tx, SYSTEM, { action: "order.paid", entity: "order", entityId: order.id, after: { ...order, membershipId: membership.id } });
          const after = one(await tx.update(subscriptions).set({ currentMembershipId: membership.id, status: "active", lastFailureAt: null, lastFailureReason: null }).where(eq(subscriptions.id, sub.id)).returning());
          await audit(tx, SYSTEM, { action: "subscription.renewed", entity: "subscription", entityId: sub.id, before: sub, after });
          break;
        }
        case "renewal_failed": {
          const sub = await findSubscription(tx, provider, event.match);
          if (!sub) break;
          const after = one(await tx.update(subscriptions).set({ status: "past_due", lastFailureAt: deps.clock(), lastFailureReason: event.reason }).where(eq(subscriptions.id, sub.id)).returning());
          await audit(tx, SYSTEM, { action: "subscription.renewal_failed", entity: "subscription", entityId: sub.id, before: sub, after });
          break;
        }
        case "subscription_ended": {
          const sub = await findSubscription(tx, provider, event.match);
          if (!sub || sub.status === "cancelled") break;
          const after = one(await tx.update(subscriptions).set({ status: "cancelled", cancelledAt: deps.clock() }).where(eq(subscriptions.id, sub.id)).returning());
          await audit(tx, SYSTEM, { action: "subscription.ended", entity: "subscription", entityId: sub.id, before: sub, after });
          break;
        }
        case "refund_succeeded":
        case "refund_failed": {
          const [refund] = await tx.select().from(refunds).where(eq(refunds.providerRefundId, event.providerRefundId)).for("update");
          if (refund?.status === "processing") await settleRefund(tx, refund, event.kind === "refund_succeeded" ? { ok: true } : { ok: false, reason: event.reason }, SYSTEM);
          break;
        }
      }
      return "applied";
    });
  }

  // ------------------------------------------------------------------ Auto-renew

  async function setAutoRenew(memberId: string, subscriptionId: string, on: boolean) {
    const [sub] = await db.select().from(subscriptions).where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.memberId, memberId)));
    if (!sub) fail(404, "not_found", "Subscription not found");
    if (sub.status === "cancelled") fail(409, "subscription_cancelled", "This pass no longer renews; buy a new one when it ends");
    if (!sub.providerSubscriptionId) fail(409, "not_ready", "Still setting up auto-renew; try again in a minute");
    const client = payments.byName(sub.provider);
    if (!client) fail(503, "provider_unavailable", "Payments aren't available right now");
    await client.setAutoRenew({ providerSubscriptionId: sub.providerSubscriptionId, data: sub.providerData }, on);
    await db.transaction(async (tx) => {
      const after = one(await tx.update(subscriptions).set({ cancelAtPeriodEnd: !on }).where(eq(subscriptions.id, sub.id)).returning());
      await audit(tx, { type: "member", id: memberId }, { action: on ? "subscription.auto_renew_on" : "subscription.auto_renew_off", entity: "subscription", entityId: sub.id, before: sub, after });
    });
  }

  // ------------------------------------------------------------------ Crew

  async function crewOf(memberId: string, membershipId: string) {
    const [ms] = await db.select().from(memberships).where(and(eq(memberships.id, membershipId), eq(memberships.memberId, memberId)));
    if (!ms || !ms.groupId) fail(404, "not_found", "Crew pass not found");
    const plan = one(await db.select().from(plans).where(eq(plans.id, ms.planId)));
    // Only the buyer invites: the pass that started the group.
    const [bought] = await db.select({ id: orders.id }).from(orders).where(and(eq(orders.membershipId, ms.id), eq(orders.memberId, memberId)));
    const crew = await db
      .select({ membershipId: memberships.id, memberId: members.id, fullName: members.fullName })
      .from(memberships)
      .innerJoin(members, eq(members.id, memberships.memberId))
      .where(and(eq(memberships.groupId, ms.groupId), ne(memberships.status, "cancelled")));
    const invites = await db.select().from(crewInvites).where(and(eq(crewInvites.groupId, ms.groupId), eq(crewInvites.status, "pending")));
    return { membership: ms, plan, isBuyer: Boolean(bought), crew, invites, seatsLeft: Math.max(0, plan.groupSize - crew.length - invites.length) };
  }

  async function invite(memberId: string, membershipId: string, person: { fullName: string; phone: string }) {
    const c = await crewOf(memberId, membershipId);
    if (!c.isBuyer) fail(403, "not_buyer", "Only the person who bought the Crew pass can invite");
    if (c.seatsLeft < 1) fail(422, "crew_full", "Your crew is full");
    if (c.membership.endsOn < today() || c.membership.status !== "active") fail(422, "pass_inactive", "This pass isn't active");
    const [already] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(members, eq(members.id, memberships.memberId))
      .where(and(eq(memberships.groupId, c.membership.groupId ?? ""), eq(members.phone, person.phone), ne(memberships.status, "cancelled")));
    if (already) fail(409, "already_in_crew", "They're already in your crew");
    await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(crewInvites)
        .values({ groupId: c.membership.groupId ?? "", membershipId: c.membership.id, invitedByMemberId: memberId, fullName: person.fullName, phone: person.phone })
        .onConflictDoNothing()
        .returning();
      if (!row) fail(409, "already_invited", "You've already invited this number");
      await audit(tx, { type: "member", id: memberId }, { action: "crew_invite.created", entity: "crew_invite", entityId: row.id, after: row });
    });
  }

  async function cancelInvite(memberId: string, inviteId: string) {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(crewInvites).where(and(eq(crewInvites.id, inviteId), eq(crewInvites.invitedByMemberId, memberId))).for("update");
      if (!before) fail(404, "not_found", "Invite not found");
      if (before.status !== "pending") fail(409, "not_pending", "This invite has already been answered");
      const after = one(await tx.update(crewInvites).set({ status: "cancelled" }).where(eq(crewInvites.id, inviteId)).returning());
      await audit(tx, { type: "member", id: memberId }, { action: "crew_invite.cancelled", entity: "crew_invite", entityId: inviteId, before, after });
    });
  }

  /** Invites waiting for this member's phone number. */
  const invitesFor = (phone: string) =>
    db
      .select({ id: crewInvites.id, fullName: crewInvites.fullName, invitedBy: members.fullName, plan: plans.name, startsOn: memberships.startsOn, endsOn: memberships.endsOn })
      .from(crewInvites)
      .innerJoin(members, eq(members.id, crewInvites.invitedByMemberId))
      .innerJoin(memberships, eq(memberships.id, crewInvites.membershipId))
      .innerJoin(plans, eq(plans.id, memberships.planId))
      .where(and(eq(crewInvites.phone, phone), eq(crewInvites.status, "pending"), eq(memberships.status, "active")));

  /** Joins the crew: a pass in the group with the same dates as the buyer's, so shared allowances line up. */
  async function acceptInvite(member: typeof members.$inferSelect, inviteId: string) {
    await db.transaction(async (tx) => {
      const [inv] = await tx.select().from(crewInvites).where(and(eq(crewInvites.id, inviteId), eq(crewInvites.phone, member.phone))).for("update");
      if (!inv) fail(404, "not_found", "Invite not found");
      if (inv.status !== "pending") fail(409, "not_pending", "This invite has already been answered");
      const buyer = one(await tx.select().from(memberships).where(eq(memberships.id, inv.membershipId)));
      if (buyer.status !== "active" || buyer.endsOn < today()) fail(422, "pass_inactive", "This Crew pass has ended");
      const membership = one(
        await tx
          .insert(memberships)
          .values({ memberId: member.id, planId: buyer.planId, startsOn: buyer.startsOn, endsOn: buyer.endsOn, status: "active", paymentSource: "direct", groupId: buyer.groupId })
          .returning(),
      );
      await audit(tx, { type: "member", id: member.id }, { action: "membership.created", entity: "membership", entityId: membership.id, after: { ...membership, crewInviteId: inv.id } });
      await grantAllowances(tx, membership.id, { type: "member", id: member.id });
      const after = one(await tx.update(crewInvites).set({ status: "accepted", acceptedMembershipId: membership.id }).where(eq(crewInvites.id, inv.id)).returning());
      await audit(tx, { type: "member", id: member.id }, { action: "crew_invite.accepted", entity: "crew_invite", entityId: inv.id, before: inv, after });
    });
  }

  // ------------------------------------------------------------------ Refunds

  /** A refund that went through (or didn't): the order's status, and the pass if it was to end. */
  async function settleRefund(tx: Tx, refund: typeof refunds.$inferSelect, outcome: { ok: true } | { ok: false; reason: string }, actor: Actor) {
    const after = one(await tx.update(refunds).set(outcome.ok ? { status: "succeeded" } : { status: "failed", failureReason: outcome.reason }).where(eq(refunds.id, refund.id)).returning());
    await audit(tx, actor, { action: outcome.ok ? "refund.succeeded" : "refund.failed", entity: "refund", entityId: refund.id, before: refund, after });
    if (!outcome.ok) return;
    const order = one(await tx.select().from(orders).where(eq(orders.id, refund.orderId)).for("update"));
    const done = await tx.select().from(refunds).where(and(eq(refunds.orderId, order.id), eq(refunds.status, "succeeded")));
    const total = done.reduce((n, r) => n + r.amountMinor, 0);
    const orderAfter = one(await tx.update(orders).set({ status: total >= order.amountMinor ? "refunded" : "partially_refunded" }).where(eq(orders.id, order.id)).returning());
    await audit(tx, actor, { action: "order.refunded", entity: "order", entityId: order.id, before: order, after: orderAfter });
    if (refund.endsPass && order.membershipId) {
      const ms = one(await tx.select().from(memberships).where(eq(memberships.id, order.membershipId)));
      // A Crew pass ends for the whole crew.
      const ending = await tx
        .select()
        .from(memberships)
        .where(and(ms.groupId ? eq(memberships.groupId, ms.groupId) : eq(memberships.id, ms.id), inArray(memberships.status, ["active", "suspended", "pending"])));
      for (const m of ending) {
        const ended = one(await tx.update(memberships).set({ status: "cancelled" }).where(eq(memberships.id, m.id)).returning());
        await audit(tx, actor, { action: "membership.cancelled", entity: "membership", entityId: m.id, before: m, after: { ...ended, refundId: refund.id } });
      }
      if (order.subscriptionId) {
        const sub = one(await tx.select().from(subscriptions).where(eq(subscriptions.id, order.subscriptionId)));
        if (sub.status !== "cancelled") {
          const subAfter = one(await tx.update(subscriptions).set({ status: "cancelled", cancelledAt: deps.clock(), cancelAtPeriodEnd: true }).where(eq(subscriptions.id, sub.id)).returning());
          await audit(tx, actor, { action: "subscription.cancelled", entity: "subscription", entityId: sub.id, before: sub, after: subAfter });
        }
      }
    }
  }

  /** Sends an approved refund to the provider, then records what happened. */
  async function sendRefund(refundId: string, actor: Actor) {
    const refund = one(await db.select().from(refunds).where(eq(refunds.id, refundId)));
    const order = one(await db.select().from(orders).where(eq(orders.id, refund.orderId)));
    const client = payments.byName(order.provider);
    let result: { providerRefundId: string; status: "succeeded" | "processing" } | { error: string };
    try {
      if (!client) throw new Error("Payments aren't set up for this provider");
      if (!order.providerPaymentId) throw new Error("The provider's payment id is missing");
      result = await client.refund({ providerPaymentId: order.providerPaymentId, amountMinor: refund.amountMinor, currency: order.currency, reference: refund.id });
    } catch (err) {
      result = { error: err instanceof Error ? err.message : "The refund couldn't be sent" };
    }
    await db.transaction(async (tx) => {
      const current = one(await tx.select().from(refunds).where(eq(refunds.id, refundId)).for("update"));
      if ("error" in result) return settleRefund(tx, current, { ok: false, reason: result.error }, actor);
      const withRef = one(await tx.update(refunds).set({ providerRefundId: result.providerRefundId }).where(eq(refunds.id, refundId)).returning());
      // Some refunds finish at once; the rest are settled by the provider's webhook.
      if (result.status === "succeeded") await settleRefund(tx, withRef, { ok: true }, actor);
    });
    // The pass ended with the refund: stop the provider charging next year too.
    if (refund.endsPass && order.subscriptionId && client && !("error" in result)) {
      const sub = one(await db.select().from(subscriptions).where(eq(subscriptions.id, order.subscriptionId)));
      if (sub.providerSubscriptionId) await client.setAutoRenew({ providerSubscriptionId: sub.providerSubscriptionId, data: sub.providerData }, false).catch(() => null);
    }
    return one(await db.select().from(refunds).where(eq(refunds.id, refundId)));
  }

  async function requestRefund(staffId: string, orderId: string, input: { amountMinor: number; reason: string; endsPass: boolean }) {
    const created = await db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
      if (!order) fail(404, "not_found", "Order not found");
      if (order.status !== "paid" && order.status !== "partially_refunded") fail(409, "not_refundable", "Only paid orders can be refunded");
      const existing = await tx.select().from(refunds).where(eq(refunds.orderId, orderId));
      const left = refundable(order.amountMinor, existing);
      if (input.amountMinor > left) fail(422, "too_much", `At most ${left} can still be refunded`);
      const row = one(
        await tx
          .insert(refunds)
          .values({ orderId, amountMinor: input.amountMinor, currency: order.currency, reason: input.reason, endsPass: input.endsPass, requestedById: staffId, status: refundNeedsApproval(input.amountMinor, order.currency) ? "awaiting_approval" : "processing" })
          .returning(),
      );
      await audit(tx, { type: "staff", id: staffId }, { action: row.status === "awaiting_approval" ? "refund.requested" : "refund.started", entity: "refund", entityId: row.id, after: row });
      return row;
    });
    return created.status === "processing" ? sendRefund(created.id, { type: "staff", id: staffId }) : created;
  }

  async function decideRefund(staffId: string, refundId: string, approve: boolean, note: string | null) {
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(refunds).where(eq(refunds.id, refundId)).for("update");
      if (!before) fail(404, "not_found", "Refund not found");
      if (before.status !== "awaiting_approval") fail(409, "not_waiting", "This refund isn't waiting for approval");
      if (before.requestedById === staffId) fail(403, "same_person", "A different person must approve a refund you asked for");
      const after = one(await tx.update(refunds).set({ status: approve ? "processing" : "rejected", decidedById: staffId, decidedAt: deps.clock(), decisionNote: note }).where(eq(refunds.id, refundId)).returning());
      await audit(tx, { type: "staff", id: staffId }, { action: approve ? "refund.approved" : "refund.rejected", entity: "refund", entityId: refundId, before, after });
    });
    return approve ? sendRefund(refundId, { type: "staff", id: staffId }) : one(await db.select().from(refunds).where(eq(refunds.id, refundId)));
  }

  return { startCheckout, applyEvent, setAutoRenew, crewOf, invite, cancelInvite, invitesFor, acceptInvite, requestRefund, decideRefund, providerFor };
}

export type PaymentService = ReturnType<typeof paymentService>;
