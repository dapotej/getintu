// Payments through the API with Stripe and Paystack faked at the network: buying a pass, the
// webhooks that activate it (once), renewals, auto-renew, Crew invites, TEST payments, and refunds
// with a second approver above the set amount.
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createDb, one, schema } from "@intu/db";
import { createPayments } from "../src/payments/setup.ts";
import { paystackSignature, stripeSignature } from "../src/payments/providers.ts";
import { createStaff, testApi } from "./support/auth.ts";
import { categoryIdOf } from "./support/fixtures.ts";

const url = process.env.DATABASE_URL;
const STRIPE_WEBHOOK_SECRET = "whsec_test_intu";
const PAYSTACK_KEY = "sk_test_paystack_intu";

/** Stripe and Paystack as the API sees them: each request recorded and answered. */
function fakeProviders() {
  const sent: { path: string; body: string }[] = [];
  let n = 0;
  // Ids stay unique across test runs, which share a database.
  const run = randomUUID().slice(0, 8);
  const refundStatus = { stripe: "succeeded" };
  // What Stripe's checkout sessions and Paystack's transactions look like when asked about directly.
  const sessions = new Map<string, Record<string, unknown>>();
  const transactions = new Map<string, Record<string, unknown>>();
  const reply = (data: unknown, paystack = false) => new Response(JSON.stringify(paystack ? { status: true, message: "ok", data } : data), { status: 200, headers: { "content-type": "application/json" } });
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(input));
    const body = String(init?.body ?? "");
    sent.push({ path: `${u.host}${u.pathname}`, body });
    n += 1;
    if (u.host === "api.stripe.com") {
      if (u.pathname === "/v1/checkout/sessions") {
        const ref = new URLSearchParams(body).get("client_reference_id");
        return reply({ id: `cs_test_${run}_${n}`, url: `https://checkout.stripe.com/c/pay/cs_test_${run}_${n}?order=${ref}` });
      }
      if (u.pathname.startsWith("/v1/checkout/sessions/")) {
        const id = u.pathname.split("/").pop() ?? "";
        return reply(sessions.get(id) ?? { id, status: "open", payment_status: "unpaid" });
      }
      if (u.pathname.startsWith("/v1/invoices/")) return reply({ id: u.pathname.split("/").pop(), payment_intent: `pi_test_${run}_${n}` });
      if (u.pathname === "/v1/refunds") return reply({ id: `re_test_${run}_${n}`, status: refundStatus.stripe });
      if (u.pathname.startsWith("/v1/subscriptions/")) return reply({ id: u.pathname.split("/").pop() });
    }
    if (u.host === "api.paystack.co") {
      if (u.pathname === "/plan") return reply({ plan_code: `PLN_test_${run}_${n}` }, true);
      if (u.pathname === "/transaction/initialize") return reply({ authorization_url: `https://checkout.paystack.com/${n}`, reference: JSON.parse(body).reference }, true);
      if (u.pathname.startsWith("/transaction/verify/")) {
        const t = transactions.get(decodeURIComponent(u.pathname.split("/").pop() ?? ""));
        return t ? reply(t, true) : new Response(JSON.stringify({ status: false, message: "Transaction reference not found" }), { status: 400 });
      }
      if (u.pathname === "/refund") return reply({ id: `${run}${n}`, status: "pending" }, true);
      if (u.pathname.startsWith("/subscription/")) return reply({}, true);
    }
    return new Response(JSON.stringify({ error: { message: "unexpected" } }), { status: 404 });
  }) as typeof fetch;
  return { f, sent, refundStatus, sessions, transactions };
}

describe.runIf(url)("payments", () => {
  const { db, sql } = createDb(url ?? "", { max: 10 });
  afterAll(() => sql.end());
  // Friday 23 October 2026, 13:00 in Lagos.
  const now = new Date("2026-10-23T12:00:00Z");
  const fake = fakeProviders();
  const payments = createPayments({
    apiUrl: "https://api.test",
    stripe: { secretKey: "sk_test_stripe_intu", webhookSecret: STRIPE_WEBHOOK_SECRET },
    paystack: { secretKey: PAYSTACK_KEY },
    allowTest: false,
    fetch: fake.f,
    now: () => now,
  });
  const { app, as, asMember } = testApi(db, { clock: () => now, payments });

  const stripeEvent = async (type: string, object: Record<string, unknown>, id = `evt_${randomUUID()}`) => {
    const raw = JSON.stringify({ id, type, data: { object } });
    const res = await app.request("/webhooks/stripe", { method: "POST", headers: { "stripe-signature": stripeSignature(STRIPE_WEBHOOK_SECRET, raw, Math.floor(now.getTime() / 1000)), "content-type": "application/json" }, body: raw });
    return res.status;
  };
  const paystackEvent = async (event: string, data: Record<string, unknown>) => {
    const raw = JSON.stringify({ event, data });
    const res = await app.request("/webhooks/paystack", { method: "POST", headers: { "x-paystack-signature": paystackSignature(PAYSTACK_KEY, raw), "content-type": "application/json" }, body: raw });
    return res.status;
  };

  const tag = randomUUID().slice(0, 6);
  let season: typeof schema.plans.$inferSelect;
  let annual: typeof schema.plans.$inferSelect;
  let crew: typeof schema.plans.$inferSelect;
  beforeAll(async () => {
    const beach = await categoryIdOf(db, "C03-S01");
    const make = async (values: Partial<typeof schema.plans.$inferInsert>, prices: [string, number][], shared = false) => {
      const plan = one(await db.insert(schema.plans).values({ code: `TEST-PAY-${tag}-${randomUUID().slice(0, 4)}`, name: `TEST Pay ${tag}`, isTest: true, ...values }).returning());
      for (const [currency, amountMinor] of prices) await db.insert(schema.planPrices).values({ planId: plan.id, currency: currency as "NGN", amountMinor });
      await db.insert(schema.benefits).values({ planId: plan.id, categoryId: beach, quantity: 4, period: "per_pass", sharedByGroup: shared });
      return plan;
    };
    season = await make({ name: `TEST December ${tag}`, seasonStartsOn: "2026-12-01", seasonEndsOn: "2027-01-10", onSaleFrom: "2026-10-01" }, [["NGN", 50_000_000], ["GBP", 25_000]]);
    annual = await make({ name: `TEST Annual ${tag}`, durationDays: 365 }, [["GBP", 49_900], ["NGN", 75_000_000]]);
    crew = await make({ name: `TEST Crew ${tag}`, seasonStartsOn: "2026-12-01", seasonEndsOn: "2027-01-10", groupSize: 3 }, [["GBP", 60_000]], true);
  });

  /** A member signed in to the app, with an email unless told otherwise. */
  const member = async (opts: { email?: string | null; phone?: string } = {}) => {
    const phone = opts.phone ?? `+999${randomInt(10 ** 9, 10 ** 10)}`;
    const row = one(await db.insert(schema.members).values({ fullName: `TEST Buyer ${randomUUID().slice(0, 4)}`, phone, email: opts.email === undefined ? "buyer@example.com" : opts.email, isTest: true }).returning());
    const client = asMember({ authUserId: randomUUID(), phone });
    expect((await client.get("/me")).status).toBe(200);
    return { row, client };
  };
  const orderOf = async (id: string) => one(await db.select().from(schema.orders).where(eq(schema.orders.id, id)));

  it("lists the plans on sale with their dates, prices and what they include", async () => {
    const { client } = await member({ phone: `+234${randomInt(10 ** 9, 10 ** 10)}` });
    const res = (await client.get("/plans")).json;
    expect(res.currency).toBe("NGN");
    const dec = res.plans.find((p: { id: string }) => p.id === season.id);
    expect(dec).toMatchObject({ startsOn: "2026-12-01", endsOn: "2027-01-10", renews: false, crewSize: 1, prices: expect.arrayContaining([{ currency: "NGN", amountMinor: 50_000_000 }]), benefits: [{ name: "Beach Clubs", quantity: 4, period: "per_pass" }] });
    expect(res.plans.find((p: { id: string }) => p.id === annual.id)).toMatchObject({ startsOn: "2026-10-23", endsOn: "2027-10-22", renews: true });
  });

  it("sells a pass by card through Stripe: the webhook makes the pass, once", async () => {
    const { row, client } = await member({ email: null });
    expect((await client.post("/checkout", { planId: season.id, currency: "GBP" })).json.error.code).toBe("email_required");
    const start = await client.post("/checkout", { planId: season.id, currency: "GBP", email: "ada@example.com" });
    expect(start.status).toBe(201);
    expect(start.json).toMatchObject({ provider: "stripe", url: expect.stringContaining("checkout.stripe.com"), terms: { startsOn: "2026-12-01", endsOn: "2027-01-10", renews: false } });
    const order = await orderOf(start.json.orderId);
    expect(order).toMatchObject({ status: "pending", amountMinor: 25_000, currency: "GBP", provider: "stripe", memberId: row.id });
    expect((await client.get(`/me/orders/${order.id}`)).json.order.status).toBe("pending");

    const paid = { id: order.providerRef, client_reference_id: order.id, payment_status: "paid", amount_total: 25_000, currency: "gbp", payment_intent: "pi_season_1" };
    expect(await stripeEvent("checkout.session.completed", paid, `evt_paid_${order.id}`)).toBe(200);
    expect(await stripeEvent("checkout.session.completed", paid, `evt_paid_${order.id}`)).toBe(200);
    const after = await orderOf(order.id);
    expect(after).toMatchObject({ status: "paid", providerPaymentId: "pi_season_1" });
    const passes = await db.select().from(schema.memberships).where(eq(schema.memberships.memberId, row.id));
    expect(passes).toHaveLength(1);
    expect(passes[0]).toMatchObject({ id: after.membershipId, status: "active", startsOn: "2026-12-01", endsOn: "2027-01-10", paymentSource: "direct" });
    expect(await db.select().from(schema.allowances).where(eq(schema.allowances.membershipId, after.membershipId ?? ""))).toHaveLength(1);
    const [audit] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.entityId, order.id), eq(schema.auditLog.action, "order.paid")));
    expect(audit?.actorType).toBe("system");
    expect((await client.get("/me/orders")).json.orders[0]).toMatchObject({ id: order.id, status: "paid", plan: { id: season.id } });
    // A forged event is refused.
    const raw = JSON.stringify({ id: "evt_forged", type: "checkout.session.completed", data: { object: paid } });
    expect((await app.request("/webhooks/stripe", { method: "POST", headers: { "stripe-signature": stripeSignature("whsec_wrong", raw, Math.floor(now.getTime() / 1000)) }, body: raw })).status).toBe(400);
  });

  it("asks the provider when the webhook hasn't come, and still makes only one pass", async () => {
    // Stripe: paid, but its webhook is late. The app's check while it waits finds out.
    const { row, client } = await member();
    const { orderId } = (await client.post("/checkout", { planId: season.id, currency: "GBP" })).json;
    const order = await orderOf(orderId);
    expect((await client.get(`/me/orders/${orderId}`)).json.order.status).toBe("pending");
    const session = { id: order.providerRef, status: "complete", payment_status: "paid", client_reference_id: orderId, amount_total: 25_000, currency: "gbp", payment_intent: "pi_late" };
    fake.sessions.set(order.providerRef ?? "", session);
    // Checked at most every few seconds: the first answer stands until then.
    expect((await client.get(`/me/orders/${orderId}`)).json.order.status).toBe("pending");
    const finance = as(await createStaff(db, "finance"));
    expect((await finance.post(`/admin/orders/${orderId}/check`)).json).toMatchObject({ changed: true, order: { status: "paid" } });
    // The webhook arrives after all: nothing more happens.
    await stripeEvent("checkout.session.completed", session);
    expect(await db.select().from(schema.memberships).where(eq(schema.memberships.memberId, row.id))).toHaveLength(1);

    // Paystack: verified while the app waits, under the same event id as the webhook's.
    const buyer = await member();
    const start = (await buyer.client.post("/checkout", { planId: season.id, currency: "NGN" })).json;
    fake.transactions.set(start.orderId, { id: `${tag}9001`, status: "success", reference: start.orderId, amount: 50_000_000, currency: "NGN", metadata: { orderId: start.orderId } });
    expect((await buyer.client.get(`/me/orders/${start.orderId}`)).json.order).toMatchObject({ status: "paid", membershipId: expect.any(String) });
    expect(await paystackEvent("charge.success", { id: `${tag}9001`, reference: start.orderId, amount: 50_000_000, currency: "NGN", metadata: { orderId: start.orderId } })).toBe(200);
    expect(await db.select().from(schema.memberships).where(eq(schema.memberships.memberId, buyer.row.id))).toHaveLength(1);
    // A checkout Paystack never saw stays pending, without an error.
    const third = await member();
    const left = (await third.client.post("/checkout", { planId: season.id, currency: "NGN" })).json;
    expect((await third.client.get(`/me/orders/${left.orderId}`)).json.order.status).toBe("pending");
  });

  it("won't sell a plan the member already holds; a second payment for it is flagged for refund", async () => {
    const { row, client } = await member();
    // Two checkouts opened before either is paid.
    const first = (await client.post("/checkout", { planId: season.id, currency: "GBP" })).json.orderId;
    const second = (await client.post("/checkout", { planId: season.id, currency: "GBP" })).json.orderId;
    for (const orderId of [first, second]) {
      const order = await orderOf(orderId);
      await stripeEvent("checkout.session.completed", { id: order.providerRef, client_reference_id: orderId, payment_status: "paid", amount_total: 25_000, currency: "gbp", payment_intent: `pi_${orderId}` });
    }
    expect(await db.select().from(schema.memberships).where(eq(schema.memberships.memberId, row.id))).toHaveLength(1);
    expect(await orderOf(second)).toMatchObject({ status: "paid", membershipId: null, failureReason: expect.stringContaining("refund") });
    // Now it's held: not offered, and not sold again.
    expect((await client.get("/plans")).json.plans.find((p: { id: string }) => p.id === season.id).held).toBe(true);
    expect((await client.get("/plans")).json.plans.find((p: { id: string }) => p.id === annual.id).held).toBe(false);
    expect((await client.post("/checkout", { planId: season.id, currency: "GBP" })).json.error.code).toBe("already_have_plan");
    // A different plan is fine.
    expect((await client.post("/checkout", { planId: annual.id, currency: "GBP" })).status).toBe(201);
    // Ops can add a second one only on purpose.
    const ops = as(await createStaff(db, "ops"));
    expect((await ops.post(`/admin/members/${row.id}/memberships`, { planId: season.id, paymentSource: "gift" })).json.error.code).toBe("already_have_plan");
    expect((await ops.post(`/admin/members/${row.id}/memberships`, { planId: season.id, paymentSource: "gift", allowSamePlan: true })).status).toBe(201);
  });

  it("cancels a pass by hand: the plan can be given again, and a yearly pass stops renewing", async () => {
    const { row, client } = await member();
    const { orderId } = (await client.post("/checkout", { planId: annual.id, currency: "GBP" })).json;
    const order = await orderOf(orderId);
    const subId = `sub_cancel_${tag}`;
    await stripeEvent("checkout.session.completed", { id: order.providerRef, client_reference_id: orderId, payment_status: "paid", amount_total: 49_900, currency: "gbp", subscription: subId, customer: "cus_c", invoice: "in_c" });
    const pass = (await orderOf(orderId)).membershipId ?? "";
    const ops = as(await createStaff(db, "ops"));
    // Suspended still holds the plan.
    await ops.post(`/admin/memberships/${pass}/suspend`, { reason: "TEST checking" });
    expect((await ops.post(`/admin/members/${row.id}/memberships`, { planId: annual.id, paymentSource: "gift" })).json.error.code).toBe("already_have_plan");
    expect((await ops.post(`/admin/memberships/${pass}/cancel`, {})).status).toBe(400);
    const res = await ops.post(`/admin/memberships/${pass}/cancel`, { reason: "TEST set up by mistake" });
    expect(res.json.memberships.find((m: { id: string }) => m.id === pass).status).toBe("cancelled");
    expect(fake.sent.at(-1)).toMatchObject({ path: `api.stripe.com/v1/subscriptions/${subId}`, body: "cancel_at_period_end=true" });
    expect((await client.get("/me/subscriptions")).json.subscriptions[0]).toMatchObject({ status: "cancelled", autoRenew: false });
    expect((await ops.post(`/admin/memberships/${pass}/cancel`, { reason: "TEST again" })).json.error.code).toBe("invalid_status");
    const [audit] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.entityId, pass), eq(schema.auditLog.action, "membership.cancelled")));
    expect(audit?.after).toMatchObject({ reason: "TEST set up by mistake" });
    // The plan can be given again.
    expect((await ops.post(`/admin/members/${row.id}/memberships`, { planId: annual.id, paymentSource: "gift" })).status).toBe(201);
  });

  it("doesn't activate a payment for the wrong amount", async () => {
    const { row, client } = await member();
    const { orderId } = (await client.post("/checkout", { planId: season.id, currency: "GBP" })).json;
    const order = await orderOf(orderId);
    await stripeEvent("checkout.session.completed", { id: order.providerRef, client_reference_id: orderId, payment_status: "paid", amount_total: 100, currency: "gbp", payment_intent: "pi_x" });
    expect(await orderOf(orderId)).toMatchObject({ status: "failed", failureReason: expect.stringContaining("expected 25000 GBP"), membershipId: null });
    expect(await db.select().from(schema.memberships).where(eq(schema.memberships.memberId, row.id))).toHaveLength(0);
  });

  it("renews a yearly pass with Stripe, lets the member turn auto-renew off, and flags failed renewals", async () => {
    const { row, client } = await member();
    const { orderId } = (await client.post("/checkout", { planId: annual.id, currency: "GBP" })).json;
    const order = await orderOf(orderId);
    await stripeEvent("checkout.session.completed", { id: order.providerRef, client_reference_id: orderId, payment_status: "paid", amount_total: 49_900, currency: "gbp", subscription: `sub_${tag}`, customer: "cus_1", invoice: "in_first" });
    const paid = await orderOf(orderId);
    expect(paid.providerPaymentId).toMatch(/^pi_test_/);
    const [sub] = (await client.get("/me/subscriptions")).json.subscriptions;
    expect(sub).toMatchObject({ status: "active", autoRenew: true, amountMinor: 49_900, currentMembershipId: paid.membershipId });

    // A year later: the next year is a new pass from the day after this one ends.
    await stripeEvent("invoice.paid", { billing_reason: "subscription_cycle", subscription: `sub_${tag}`, payment_intent: "pi_year2", amount_paid: 49_900, currency: "gbp" });
    const passes = await db.select().from(schema.memberships).where(eq(schema.memberships.memberId, row.id));
    expect(passes.map((p) => [p.startsOn, p.endsOn]).sort()).toEqual([
      ["2026-10-23", "2027-10-22"],
      ["2027-10-23", "2028-10-21"],
    ]);
    const orders = (await client.get("/me/orders")).json.orders;
    expect(orders.map((o: { kind: string }) => o.kind).sort()).toEqual(["new", "renewal"]);

    // Auto-renew off: Stripe stops at the end of the year.
    expect((await client.post(`/me/subscriptions/${sub.id}/auto-renew`, { on: false })).status).toBe(200);
    expect(fake.sent.at(-1)).toMatchObject({ path: `api.stripe.com/v1/subscriptions/sub_${tag}`, body: "cancel_at_period_end=true" });
    expect((await client.get("/me/subscriptions")).json.subscriptions[0].autoRenew).toBe(false);

    // A declined card shows to finance as a failed renewal.
    await stripeEvent("invoice.payment_failed", { billing_reason: "subscription_cycle", subscription: `sub_${tag}`, attempt_count: 1 });
    const finance = as(await createStaff(db, "finance"));
    const { failedRenewals } = (await finance.get("/admin/payments")).json;
    expect(failedRenewals.find((f: { member: { id: string } }) => f.member.id === row.id)).toMatchObject({ reason: expect.stringContaining("declined"), amountMinor: 49_900 });
    await stripeEvent("customer.subscription.deleted", { id: `sub_${tag}` });
    expect((await client.get("/me/subscriptions")).json.subscriptions[0]).toMatchObject({ status: "cancelled", autoRenew: false });
  });

  it("sells in naira through Paystack, keeps its yearly plan, and renews by its customer and plan", async () => {
    const { row, client } = await member();
    const start = (await client.post("/checkout", { planId: annual.id, currency: "NGN" })).json;
    expect(start).toMatchObject({ provider: "paystack", url: expect.stringContaining("checkout.paystack.com") });
    const [price] = await db.select().from(schema.planPrices).where(and(eq(schema.planPrices.planId, annual.id), eq(schema.planPrices.currency, "NGN")));
    expect(price?.paystackPlanCode).toMatch(/^PLN_test_/);
    const plan = price?.paystackPlanCode ?? "";
    const customer = `CUS_${tag}`;
    await paystackEvent("charge.success", { id: `${tag}5001`, reference: start.orderId, amount: 75_000_000, currency: "NGN", metadata: { orderId: start.orderId }, plan: { plan_code: plan }, customer: { customer_code: customer } });
    expect(await orderOf(start.orderId)).toMatchObject({ status: "paid", providerPaymentId: `${tag}5001` });
    await paystackEvent("subscription.create", { subscription_code: `SUB_${tag}`, email_token: "tok_1", plan: { plan_code: plan }, customer: { customer_code: customer } });
    const [sub] = await db.select().from(schema.subscriptions).where(eq(schema.subscriptions.memberId, row.id));
    expect(sub).toMatchObject({ providerSubscriptionId: `SUB_${tag}`, providerData: { planCode: plan, emailToken: "tok_1" } });
    await paystackEvent("charge.success", { id: `${tag}5002`, reference: `T${tag}`, amount: 75_000_000, currency: "NGN", metadata: {}, plan: { plan_code: plan }, customer: { customer_code: customer } });
    expect(await db.select().from(schema.memberships).where(eq(schema.memberships.memberId, row.id))).toHaveLength(2);
    // Turning auto-renew off uses the email token Paystack sent.
    expect((await client.post(`/me/subscriptions/${sub?.id}/auto-renew`, { on: false })).status).toBe(200);
    expect(fake.sent.at(-1)).toMatchObject({ path: "api.paystack.co/subscription/disable" });
  });

  it("lets a Crew buyer invite the others, who join with the same dates", async () => {
    const buyer = await member();
    const { orderId } = (await buyer.client.post("/checkout", { planId: crew.id, currency: "GBP" })).json;
    const order = await orderOf(orderId);
    await stripeEvent("checkout.session.completed", { id: order.providerRef, client_reference_id: orderId, payment_status: "paid", amount_total: 60_000, currency: "gbp", payment_intent: "pi_crew" });
    const membershipId = (await orderOf(orderId)).membershipId ?? "";
    expect((await buyer.client.get(`/me/crew/${membershipId}`)).json).toMatchObject({ isBuyer: true, seatsLeft: 2, crew: [{ isMe: true }], invites: [] });

    const friendPhone = `+999${randomInt(10 ** 9, 10 ** 10)}`;
    expect((await buyer.client.post(`/me/crew/${membershipId}/invites`, { fullName: "TEST Friend", phone: friendPhone })).status).toBe(201);
    expect((await buyer.client.post(`/me/crew/${membershipId}/invites`, { fullName: "TEST Friend", phone: friendPhone })).json.error.code).toBe("already_invited");
    const other = `+999${randomInt(10 ** 9, 10 ** 10)}`;
    await buyer.client.post(`/me/crew/${membershipId}/invites`, { fullName: "TEST Other", phone: other });
    expect((await buyer.client.post(`/me/crew/${membershipId}/invites`, { fullName: "TEST Third", phone: `+999${randomInt(10 ** 9, 10 ** 10)}` })).json.error.code).toBe("crew_full");

    // The friend signs in and accepts.
    const friend = await member({ phone: friendPhone });
    const [invite] = (await friend.client.get("/me/invites")).json.invites;
    expect(invite).toMatchObject({ invitedBy: buyer.row.fullName, startsOn: "2026-12-01", endsOn: "2027-01-10" });
    expect((await friend.client.post(`/me/invites/${invite.id}/accept`)).status).toBe(200);
    const [joined] = await db.select().from(schema.memberships).where(eq(schema.memberships.memberId, friend.row.id));
    const [bought] = await db.select().from(schema.memberships).where(eq(schema.memberships.id, membershipId));
    expect(joined).toMatchObject({ groupId: bought?.groupId, startsOn: "2026-12-01", endsOn: "2027-01-10", status: "active" });
    // The crew shares one beach allowance.
    expect(await db.select().from(schema.allowances).where(eq(schema.allowances.groupId, bought?.groupId ?? ""))).toHaveLength(1);
    // Only the buyer invites.
    expect((await friend.client.post(`/me/crew/${joined?.id}/invites`, { fullName: "TEST X", phone: `+999${randomInt(10 ** 9, 10 ** 10)}` })).json.error.code).toBe("not_buyer");
    // A pending invite can be withdrawn, freeing the seat.
    const pending = (await buyer.client.get(`/me/crew/${membershipId}`)).json.invites[0];
    expect((await buyer.client.post(`/me/invites/${pending.id}/cancel`)).status).toBe(200);
    expect((await buyer.client.get(`/me/crew/${membershipId}`)).json.seatsLeft).toBe(1);
  });

  it("refunds small amounts at once, and larger ones only once someone else approves", async () => {
    const { row, client } = await member();
    const { orderId } = (await client.post("/checkout", { planId: season.id, currency: "NGN" })).json;
    await paystackEvent("charge.success", { id: `${tag}7001`, reference: orderId, amount: 50_000_000, currency: "NGN", metadata: { orderId } });
    const finance = as(await createStaff(db, "finance"));
    const lead = as(await createStaff(db, "ops_lead"));
    const ops = as(await createStaff(db, "ops"));

    expect((await ops.post(`/admin/orders/${orderId}/refunds`, { amountMinor: 1_000_000, reason: "TEST goodwill", endsPass: false })).status).toBe(403);
    // ₦10,000 goes straight to Paystack; it's done when Paystack says so.
    const small = (await finance.post(`/admin/orders/${orderId}/refunds`, { amountMinor: 1_000_000, reason: "TEST goodwill", endsPass: false })).json.refund;
    expect(small).toMatchObject({ status: "processing", providerRefundId: expect.any(String) });
    expect(fake.sent.at(-1)).toMatchObject({ path: "api.paystack.co/refund" });
    await paystackEvent("refund.processed", { id: small.providerRefundId });
    expect(await orderOf(orderId)).toMatchObject({ status: "partially_refunded" });

    // The rest, ₦490,000, ending the pass: waits for a second person.
    expect((await finance.post(`/admin/orders/${orderId}/refunds`, { amountMinor: 50_000_000, reason: "TEST too much", endsPass: true })).json.error.code).toBe("too_much");
    const big = (await finance.post(`/admin/orders/${orderId}/refunds`, { amountMinor: 49_000_000, reason: "TEST member can't travel", endsPass: true })).json.refund;
    expect(big.status).toBe("awaiting_approval");
    expect((await finance.get("/admin/refunds")).json.refunds.map((r: { id: string }) => r.id)).toContain(big.id);
    expect((await finance.post(`/admin/refunds/${big.id}/approve`)).json.error.code).toBe("same_person");
    expect((await lead.post(`/admin/refunds/${big.id}/approve`)).json.refund).toMatchObject({ status: "processing" });
    expect((await lead.post(`/admin/refunds/${big.id}/approve`)).json.error.code).toBe("not_waiting");
    await paystackEvent("refund.processed", { id: (await db.select().from(schema.refunds).where(eq(schema.refunds.id, big.id)))[0]?.providerRefundId });
    expect(await orderOf(orderId)).toMatchObject({ status: "refunded" });
    const [pass] = await db.select().from(schema.memberships).where(eq(schema.memberships.memberId, row.id));
    expect(pass?.status).toBe("cancelled");
    const [approved] = await db.select().from(schema.auditLog).where(and(eq(schema.auditLog.entityId, big.id), eq(schema.auditLog.action, "refund.approved")));
    expect(approved?.actorType).toBe("staff");
    expect((await finance.get(`/admin/orders/${orderId}`)).json.order).toMatchObject({ refundable: 0, refunds: expect.arrayContaining([expect.objectContaining({ status: "succeeded", decidedBy: null }), expect.objectContaining({ status: "succeeded", decidedBy: expect.any(String) })]) });
  });

  it("can reject a refund, and keeps payments from staff without access", async () => {
    const { client } = await member();
    const { orderId } = (await client.post("/checkout", { planId: season.id, currency: "GBP" })).json;
    const order = await orderOf(orderId);
    await stripeEvent("checkout.session.completed", { id: order.providerRef, client_reference_id: orderId, payment_status: "paid", amount_total: 25_000, currency: "gbp", payment_intent: "pi_rej" });
    const finance = as(await createStaff(db, "finance"));
    const founder = as(await createStaff(db, "founder"));
    const big = (await finance.post(`/admin/orders/${orderId}/refunds`, { amountMinor: 20_000, reason: "TEST asked for it", endsPass: true })).json.refund;
    expect((await founder.post(`/admin/refunds/${big.id}/reject`, {})).status).toBe(400);
    expect((await founder.post(`/admin/refunds/${big.id}/reject`, { note: "TEST not eligible after the season started" })).json.refund.status).toBe("rejected");
    expect((await orderOf(orderId)).status).toBe("paid");
    // Stripe answers at once for a small one.
    expect((await finance.post(`/admin/orders/${orderId}/refunds`, { amountMinor: 5_000, reason: "TEST goodwill", endsPass: false })).json.refund.status).toBe("succeeded");
    expect((await orderOf(orderId)).status).toBe("partially_refunded");
    expect((await as(await createStaff(db, "concierge")).get("/admin/payments")).status).toBe(403);
    const list = (await finance.get(`/admin/payments?status=partially_refunded`)).json.orders;
    expect(list.find((o: { id: string }) => o.id === orderId)).toMatchObject({ refundable: 20_000 });
  });
});

describe.runIf(url)("TEST payments", () => {
  const { db, sql } = createDb(url ?? "", { max: 5 });
  afterAll(() => sql.end());
  const now = new Date("2026-10-23T12:00:00Z");
  // No provider keys: the API's own TEST page stands in for the payment page.
  const { app, asMember } = testApi(db, { clock: () => now });

  it("takes a TEST payment on the API's own page, and never anywhere real", async () => {
    const plan = one(await db.insert(schema.plans).values({ code: `TEST-TP-${randomUUID().slice(0, 6)}`, name: "TEST Page Pass", seasonStartsOn: "2026-12-01", seasonEndsOn: "2027-01-10", isTest: true }).returning());
    await db.insert(schema.planPrices).values({ planId: plan.id, currency: "NGN", amountMinor: 10_000_000 });
    const phone = `+999${randomInt(10 ** 9, 10 ** 10)}`;
    const row = one(await db.insert(schema.members).values({ fullName: "TEST Page Buyer", phone, email: "page@example.com", isTest: true }).returning());
    const client = asMember({ authUserId: randomUUID(), phone });
    await client.get("/me");
    const start = (await client.post("/checkout", { planId: plan.id, currency: "NGN" })).json;
    expect(start).toMatchObject({ provider: "test", url: `http://localhost/payments/test/${start.orderId}` });
    const pageRes = await app.request(`/payments/test/${start.orderId}`);
    expect(await pageRes.text()).toContain("TEST: no money moves");
    const pay = await app.request(`/payments/test/${start.orderId}`, { method: "POST", body: new URLSearchParams({ action: "pay" }) });
    expect(pay.status).toBe(303);
    expect(pay.headers.get("location")).toContain("status=done");
    expect((await client.get(`/me/orders/${start.orderId}`)).json.order).toMatchObject({ status: "paid", membershipId: expect.any(String) });
    expect(await db.select().from(schema.memberships).where(eq(schema.memberships.memberId, row.id))).toHaveLength(1);
    expect((await app.request("/payments/return?status=done")).status).toBe(200);
  });
});
