// Stripe and Paystack on their own: what's sent to them, and their webhooks read back as events,
// with forged or stale signatures refused.
import { describe, expect, it } from "vitest";
import { InvalidSignature, paystackProvider, paystackSignature, STRIPE_API_VERSION, stripeProvider, stripeSignature } from "../src/payments/providers.ts";

interface Sent {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** A fetch that records each request and answers from a table of paths. */
function fakeFetch(answers: Record<string, unknown>) {
  const sent: Sent[] = [];
  const f = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    sent.push({ url, method: init?.method ?? "GET", headers: Object.fromEntries(new Headers(init?.headers).entries()), body: String(init?.body ?? "") });
    const path = new URL(url).pathname;
    const answer = answers[path];
    if (answer === undefined) return new Response(JSON.stringify({ error: { message: "nope" } }), { status: 404 });
    return new Response(JSON.stringify(answer), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { f, sent };
}

const now = new Date("2026-10-23T12:00:00Z");
const ts = Math.floor(now.getTime() / 1000);

describe("Stripe", () => {
  const webhookSecret = "whsec_test_123";
  const make = (answers: Record<string, unknown> = {}) => {
    const { f, sent } = fakeFetch(answers);
    return { stripe: stripeProvider({ secretKey: "sk_test_abc", webhookSecret, fetch: f, now: () => now }), sent };
  };
  const deliver = (stripe: ReturnType<typeof make>["stripe"], event: unknown, opts: { secret?: string; at?: number } = {}) => {
    const raw = JSON.stringify(event);
    return stripe.parseWebhook(raw, new Headers({ "stripe-signature": stripeSignature(opts.secret ?? webhookSecret, raw, opts.at ?? ts) }));
  };

  it("opens checkout with the price, the order and a yearly subscription when it renews", async () => {
    const { stripe, sent } = make({ "/v1/checkout/sessions": { id: "cs_test_1", url: "https://checkout.stripe.com/c/pay/cs_test_1" } });
    const res = await stripe.checkout({ orderId: "ord-1", currency: "GBP", amountMinor: 49_900, description: "intu Gold", recurring: true, email: "ada@example.com", returnUrl: "https://api/return", cancelUrl: "https://api/cancel", apiUrl: "https://api" });
    expect(res).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_1", providerRef: "cs_test_1" });
    const [req] = sent;
    expect(req?.headers).toMatchObject({ authorization: "Bearer sk_test_abc", "stripe-version": STRIPE_API_VERSION, "idempotency-key": "checkout-ord-1" });
    const form = new URLSearchParams(req?.body);
    expect(Object.fromEntries(form)).toMatchObject({
      mode: "subscription",
      client_reference_id: "ord-1",
      customer_email: "ada@example.com",
      "line_items[0][price_data][currency]": "gbp",
      "line_items[0][price_data][unit_amount]": "49900",
      "line_items[0][price_data][recurring][interval]": "year",
      "subscription_data[metadata][orderId]": "ord-1",
    });
  });

  it("reads a paid checkout, fetching the first year's payment from its invoice", async () => {
    const { stripe } = make({ "/v1/invoices/in_1": { id: "in_1", payment_intent: "pi_1" } });
    const events = await deliver(stripe, {
      id: "evt_1",
      type: "checkout.session.completed",
      data: { object: { id: "cs_1", client_reference_id: "ord-1", payment_status: "paid", amount_total: 49_900, currency: "gbp", subscription: "sub_1", customer: "cus_1", invoice: "in_1" } },
    });
    expect(events).toEqual([
      { kind: "paid", eventId: "evt_1", orderId: "ord-1", providerRef: "cs_1", providerPaymentId: "pi_1", amountMinor: 49_900, currency: "GBP", subscription: { providerSubscriptionId: "sub_1", providerCustomerId: "cus_1" } },
    ]);
  });

  it("reads renewals, failed renewals, ended subscriptions and refunds, and ignores the rest", async () => {
    const { stripe } = make();
    expect(await deliver(stripe, { id: "evt_2", type: "invoice.paid", data: { object: { billing_reason: "subscription_cycle", subscription: "sub_1", payment_intent: "pi_2", amount_paid: 49_900, currency: "gbp" } } })).toEqual([
      { kind: "renewed", eventId: "evt_2", match: { providerSubscriptionId: "sub_1" }, providerPaymentId: "pi_2", amountMinor: 49_900, currency: "GBP" },
    ]);
    expect((await deliver(stripe, { id: "evt_3", type: "invoice.paid", data: { object: { billing_reason: "subscription_create", subscription: "sub_1" } } }))[0]?.kind).toBe("ignored");
    expect((await deliver(stripe, { id: "evt_4", type: "invoice.payment_failed", data: { object: { billing_reason: "subscription_cycle", subscription: "sub_1", attempt_count: 2 } } }))[0]).toMatchObject({ kind: "renewal_failed", match: { providerSubscriptionId: "sub_1" } });
    expect((await deliver(stripe, { id: "evt_5", type: "customer.subscription.deleted", data: { object: { id: "sub_1" } } }))[0]).toEqual({ kind: "subscription_ended", eventId: "evt_5", match: { providerSubscriptionId: "sub_1" } });
    expect((await deliver(stripe, { id: "evt_6", type: "refund.updated", data: { object: { id: "re_1", status: "succeeded" } } }))[0]).toEqual({ kind: "refund_succeeded", eventId: "evt_6", providerRefundId: "re_1" });
    expect((await deliver(stripe, { id: "evt_7", type: "checkout.session.completed", data: { object: { id: "cs_2", payment_status: "unpaid" } } }))[0]?.kind).toBe("ignored");
    expect((await deliver(stripe, { id: "evt_8", type: "customer.created", data: { object: {} } }))[0]).toEqual({ kind: "ignored", eventId: "evt_8", type: "customer.created" });
  });

  it("asks Stripe how a checkout went: paid, expired, or still open", async () => {
    const paid = make({ "/v1/checkout/sessions/cs_9": { id: "cs_9", status: "complete", payment_status: "paid", client_reference_id: "ord-9", amount_total: 25_000, currency: "gbp", payment_intent: "pi_9" } });
    expect(await paid.stripe.lookup("cs_9")).toMatchObject({ kind: "paid", orderId: "ord-9", providerPaymentId: "pi_9", amountMinor: 25_000, currency: "GBP" });
    expect(paid.sent[0]).toMatchObject({ method: "GET", url: "https://api.stripe.com/v1/checkout/sessions/cs_9" });
    expect(await make({ "/v1/checkout/sessions/cs_8": { id: "cs_8", status: "expired", payment_status: "unpaid" } }).stripe.lookup("cs_8")).toEqual({ kind: "checkout_expired", eventId: "lookup:expired:cs_8", providerRef: "cs_8" });
    expect(await make({ "/v1/checkout/sessions/cs_7": { id: "cs_7", status: "open", payment_status: "unpaid" } }).stripe.lookup("cs_7")).toBeNull();
  });

  it("refuses a forged or stale signature", async () => {
    const { stripe } = make();
    const event = { id: "evt_9", type: "customer.created", data: { object: {} } };
    await expect(deliver(stripe, event, { secret: "whsec_wrong" })).rejects.toBeInstanceOf(InvalidSignature);
    await expect(deliver(stripe, event, { at: ts - 600 })).rejects.toBeInstanceOf(InvalidSignature);
    await expect(stripe.parseWebhook(JSON.stringify(event), new Headers())).rejects.toBeInstanceOf(InvalidSignature);
  });

  it("refunds against the payment, and turns auto-renew off at the end of the year", async () => {
    const { stripe, sent } = make({ "/v1/refunds": { id: "re_9", status: "pending" }, "/v1/subscriptions/sub_1": { id: "sub_1" } });
    expect(await stripe.refund({ providerPaymentId: "pi_1", amountMinor: 10_000, currency: "GBP", reference: "ref-1" })).toEqual({ providerRefundId: "re_9", status: "processing" });
    expect(new URLSearchParams(sent[0]?.body).get("payment_intent")).toBe("pi_1");
    await stripe.setAutoRenew({ providerSubscriptionId: "sub_1", data: null }, false);
    expect(new URLSearchParams(sent[1]?.body).get("cancel_at_period_end")).toBe("true");
  });
});

describe("Paystack", () => {
  const secretKey = "sk_test_paystack";
  const make = (answers: Record<string, unknown> = {}) => {
    const { f, sent } = fakeFetch(Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, { status: true, message: "ok", data: v }])));
    return { paystack: paystackProvider({ secretKey, fetch: f }), sent };
  };
  const deliver = (paystack: ReturnType<typeof make>["paystack"], event: unknown, secret = secretKey) => {
    const raw = JSON.stringify(event);
    return paystack.parseWebhook(raw, new Headers({ "x-paystack-signature": paystackSignature(secret, raw) }));
  };

  it("makes a yearly plan the first time, then opens the payment page in naira", async () => {
    const { paystack, sent } = make({ "/plan": { plan_code: "PLN_1" }, "/transaction/initialize": { authorization_url: "https://checkout.paystack.com/abc", reference: "ord-2" } });
    const res = await paystack.checkout({ orderId: "ord-2", currency: "NGN", amountMinor: 75_000_000, description: "intu Gold", recurring: true, email: "ada@example.com", returnUrl: "https://api/return", cancelUrl: "https://api/cancel", apiUrl: "https://api" });
    expect(res).toEqual({ url: "https://checkout.paystack.com/abc", providerRef: "ord-2", paystackPlanCode: "PLN_1" });
    expect(JSON.parse(sent[0]?.body ?? "")).toEqual({ name: "intu Gold", interval: "annually", amount: 75_000_000, currency: "NGN" });
    expect(JSON.parse(sent[1]?.body ?? "")).toMatchObject({ email: "ada@example.com", amount: 75_000_000, currency: "NGN", reference: "ord-2", plan: "PLN_1", metadata: { orderId: "ord-2" } });
    // Next time the plan is reused.
    const again = make({ "/transaction/initialize": { authorization_url: "https://checkout.paystack.com/def", reference: "ord-3" } });
    await again.paystack.checkout({ orderId: "ord-3", currency: "NGN", amountMinor: 75_000_000, description: "intu Gold", recurring: true, email: "b@example.com", returnUrl: "r", cancelUrl: "c", paystackPlanCode: "PLN_1", apiUrl: "https://api" });
    expect(again.sent.map((s) => new URL(s.url).pathname)).toEqual(["/transaction/initialize"]);
  });

  it("reads a first payment, the subscription it starts, a renewal and a failed renewal", async () => {
    const { paystack } = make();
    expect(await deliver(paystack, { event: "charge.success", data: { id: 101, reference: "ord-2", amount: 75_000_000, currency: "NGN", metadata: { orderId: "ord-2" }, plan: { plan_code: "PLN_1" }, customer: { customer_code: "CUS_1" } } })).toEqual([
      { kind: "paid", eventId: "charge.success:101", orderId: "ord-2", providerRef: "ord-2", providerPaymentId: "101", amountMinor: 75_000_000, currency: "NGN", subscription: { providerSubscriptionId: null, providerCustomerId: "CUS_1", data: { planCode: "PLN_1" } } },
    ]);
    expect(await deliver(paystack, { event: "subscription.create", data: { subscription_code: "SUB_1", email_token: "tok_1", plan: { plan_code: "PLN_1" }, customer: { customer_code: "CUS_1" } } })).toEqual([
      { kind: "subscription_started", eventId: "subscription.create:SUB_1", match: { providerCustomerId: "CUS_1", planCode: "PLN_1" }, providerSubscriptionId: "SUB_1", data: { planCode: "PLN_1", emailToken: "tok_1" } },
    ]);
    expect((await deliver(paystack, { event: "charge.success", data: { id: 202, reference: "T123", amount: 75_000_000, currency: "NGN", metadata: {}, plan: { plan_code: "PLN_1" }, customer: { customer_code: "CUS_1" } } }))[0]).toMatchObject({
      kind: "renewed",
      match: { providerCustomerId: "CUS_1", planCode: "PLN_1" },
      providerPaymentId: "202",
    });
    expect((await deliver(paystack, { event: "invoice.payment_failed", data: { id: 3, subscription: { subscription_code: "SUB_1" } } }))[0]).toMatchObject({ kind: "renewal_failed", match: { providerSubscriptionId: "SUB_1" } });
    expect((await deliver(paystack, { event: "refund.processed", data: { id: 77 } }))[0]).toEqual({ kind: "refund_succeeded", eventId: "refund.processed:77", providerRefundId: "77" });
  });

  it("verifies a transaction with Paystack, under the same event id as its webhook", async () => {
    const { paystack, sent } = make({ "/transaction/verify/ord-5": { id: 555, status: "success", reference: "ord-5", amount: 300_000_000, currency: "NGN", metadata: { orderId: "ord-5" } } });
    expect(await paystack.lookup("ord-5")).toEqual({ kind: "paid", eventId: "charge.success:555", orderId: "ord-5", providerRef: "ord-5", providerPaymentId: "555", amountMinor: 300_000_000, currency: "NGN", subscription: null });
    expect(sent[0]).toMatchObject({ method: "GET" });
    // Not paid yet: the member may still finish on the same page.
    expect(await make({ "/transaction/verify/ord-6": { id: 6, status: "abandoned", reference: "ord-6" } }).paystack.lookup("ord-6")).toBeNull();
  });

  it("refuses a forged signature", async () => {
    const { paystack } = make();
    await expect(deliver(paystack, { event: "charge.success", data: {} }, "sk_test_wrong")).rejects.toBeInstanceOf(InvalidSignature);
  });

  it("needs the email token to turn auto-renew off", async () => {
    const { paystack, sent } = make({ "/subscription/disable": {} });
    await expect(paystack.setAutoRenew({ providerSubscriptionId: "SUB_1", data: null }, false)).rejects.toThrow(/email token/);
    await paystack.setAutoRenew({ providerSubscriptionId: "SUB_1", data: { emailToken: "tok_1" } }, false);
    expect(JSON.parse(sent[0]?.body ?? "")).toEqual({ code: "SUB_1", token: "tok_1" });
  });
});
