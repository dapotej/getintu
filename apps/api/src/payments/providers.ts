// Stripe (pounds and dollars) and Paystack (naira) behind one interface, so the rest of the API
// never talks to either directly. Each turns its own webhooks into the same few events, after
// checking the provider's signature. Plain HTTPS calls, no SDKs; `fetch` is injected for tests.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Currency } from "@intu/rules";

export type ProviderName = "stripe" | "paystack" | "test";

export interface CheckoutRequest {
  orderId: string;
  currency: Currency;
  amountMinor: number;
  /** What the member sees on the payment page and their statement, e.g. "intu December Pass Plus". */
  description: string;
  /** A yearly subscription rather than a one-off payment. */
  recurring: boolean;
  email: string;
  /** Where the provider sends the member after paying, or if they give up. */
  returnUrl: string;
  cancelUrl: string;
  /** Paystack's yearly plan for this price, if one was made before. */
  paystackPlanCode?: string | null;
  /** The API's public address, where the TEST payment page lives. */
  apiUrl: string;
}

export interface CheckoutResult {
  url: string;
  providerRef: string;
  /** A Paystack plan made for this price, to keep for next time. */
  paystackPlanCode?: string;
}

/** Finds our subscription: by the provider's id, or (Paystack, before it sends one) by customer and plan. */
export type SubscriptionMatch = { providerSubscriptionId: string } | { providerCustomerId: string; planCode: string };

export type PaymentEvent =
  | {
      kind: "paid";
      eventId: string;
      orderId: string | null;
      providerRef: string;
      providerPaymentId: string | null;
      amountMinor: number;
      currency: string;
      subscription: { providerSubscriptionId: string | null; providerCustomerId: string | null; data?: Record<string, string> } | null;
    }
  | { kind: "subscription_started"; eventId: string; match: SubscriptionMatch; providerSubscriptionId: string; data?: Record<string, string> }
  | { kind: "renewed"; eventId: string; match: SubscriptionMatch; providerPaymentId: string | null; amountMinor: number; currency: string }
  | { kind: "renewal_failed"; eventId: string; match: SubscriptionMatch; reason: string }
  | { kind: "subscription_ended"; eventId: string; match: SubscriptionMatch }
  | { kind: "checkout_expired"; eventId: string; providerRef: string }
  | { kind: "refund_succeeded"; eventId: string; providerRefundId: string }
  | { kind: "refund_failed"; eventId: string; providerRefundId: string; reason: string }
  | { kind: "transfer_succeeded"; eventId: string; reference: string; transferCode: string | null }
  | { kind: "transfer_failed"; eventId: string; reference: string; transferCode: string | null; reason: string }
  | { kind: "ignored"; eventId: string; type: string };

export interface PaymentProviderClient {
  name: ProviderName;
  checkout(req: CheckoutRequest): Promise<CheckoutResult>;
  refund(req: { providerPaymentId: string; amountMinor: number; currency: Currency; reference: string }): Promise<{ providerRefundId: string; status: "succeeded" | "processing" }>;
  /** Turns auto-renew off (the current year runs out) or back on. */
  setAutoRenew(sub: { providerSubscriptionId: string; data: Record<string, string> | null }, on: boolean): Promise<void>;
  /** Checks the signature and reads the events; throws InvalidSignature if it isn't the provider's. */
  parseWebhook(rawBody: string, headers: Headers): Promise<PaymentEvent[]>;
  /**
   * Asks the provider directly how a checkout went, in case its webhook is late or lost: the same
   * event a webhook would bring when it's paid (or has expired), else null while it's still open.
   */
  lookup(providerRef: string): Promise<PaymentEvent | null>;
}

export class InvalidSignature extends Error {}
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

const equalHex = (a: string, b: string) => {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

// ---------------------------------------------------------------------------------------------
// Stripe

/** Pinned so invoices still carry their payment intent and the event shapes below hold. */
export const STRIPE_API_VERSION = "2024-06-20";
const STRIPE_SIGNATURE_TOLERANCE_S = 300;

/** Stripe's form encoding: nested keys as a[b][c]=v. */
function stripeForm(params: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") out.push(...stripeForm(v as Record<string, unknown>, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out;
}

export function stripeSignature(secret: string, payload: string, timestamp: number) {
  return `t=${timestamp},v1=${createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex")}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;

export function stripeProvider(opts: { secretKey: string; webhookSecret: string; fetch?: Fetch; baseUrl?: string; now?: () => Date }): PaymentProviderClient {
  const f = opts.fetch ?? fetch;
  const base = opts.baseUrl ?? "https://api.stripe.com";
  const call = async (method: "GET" | "POST", path: string, params: Record<string, unknown> = {}, idempotencyKey?: string): Promise<Json> => {
    const body = stripeForm(params).join("&");
    const res = await f(`${base}${path}${method === "GET" && body ? `?${body}` : ""}`, {
      method,
      headers: {
        authorization: `Bearer ${opts.secretKey}`,
        "stripe-version": STRIPE_API_VERSION,
        ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      ...(method === "POST" ? { body } : {}),
    });
    const json = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok) throw new ProviderError(`Stripe: ${json?.error?.message ?? res.statusText}`, res.status);
    return json;
  };
  const subMatch = (id: string): SubscriptionMatch => ({ providerSubscriptionId: id });
  /** A paid checkout session as the event that makes the pass. */
  const sessionPaid = async (o: Json, eventId: string): Promise<PaymentEvent> => {
    let paymentId: string | null = typeof o.payment_intent === "string" ? o.payment_intent : null;
    if (!paymentId && o.invoice) paymentId = (await call("GET", `/v1/invoices/${o.invoice}`)).payment_intent ?? null;
    return {
      kind: "paid",
      eventId,
      orderId: o.client_reference_id ?? o.metadata?.orderId ?? null,
      providerRef: o.id,
      providerPaymentId: paymentId,
      amountMinor: o.amount_total,
      currency: String(o.currency).toUpperCase(),
      subscription: o.subscription ? { providerSubscriptionId: o.subscription, providerCustomerId: o.customer ?? null } : null,
    };
  };

  return {
    name: "stripe",
    async checkout(req) {
      const lineItem = {
        quantity: 1,
        price_data: { currency: req.currency.toLowerCase(), unit_amount: req.amountMinor, product_data: { name: req.description }, ...(req.recurring ? { recurring: { interval: "year" } } : {}) },
      };
      const session = await call(
        "POST",
        "/v1/checkout/sessions",
        {
          mode: req.recurring ? "subscription" : "payment",
          client_reference_id: req.orderId,
          customer_email: req.email,
          success_url: req.returnUrl,
          cancel_url: req.cancelUrl,
          line_items: { 0: lineItem },
          metadata: { orderId: req.orderId },
          ...(req.recurring ? { subscription_data: { metadata: { orderId: req.orderId } } } : { payment_intent_data: { metadata: { orderId: req.orderId } } }),
        },
        `checkout-${req.orderId}`,
      );
      return { url: session.url, providerRef: session.id };
    },
    async refund(req) {
      const r = await call("POST", "/v1/refunds", { payment_intent: req.providerPaymentId, amount: req.amountMinor, metadata: { refundId: req.reference } }, `refund-${req.reference}`);
      return { providerRefundId: r.id, status: r.status === "succeeded" ? "succeeded" : "processing" };
    },
    async setAutoRenew(sub, on) {
      await call("POST", `/v1/subscriptions/${sub.providerSubscriptionId}`, { cancel_at_period_end: on ? "false" : "true" });
    },
    async lookup(providerRef) {
      const o = await call("GET", `/v1/checkout/sessions/${providerRef}`);
      if (o.payment_status === "paid") return sessionPaid(o, `lookup:${o.id}`);
      if (o.status === "expired") return { kind: "checkout_expired", eventId: `lookup:expired:${o.id}`, providerRef: o.id };
      return null;
    },
    async parseWebhook(rawBody, headers) {
      const header = headers.get("stripe-signature") ?? "";
      const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
      const t = Number(parts["t"]);
      const sigs = header
        .split(",")
        .filter((p) => p.startsWith("v1="))
        .map((p) => p.slice(3));
      const expected = createHmac("sha256", opts.webhookSecret).update(`${t}.${rawBody}`).digest("hex");
      const now = Math.floor((opts.now?.() ?? new Date()).getTime() / 1000);
      if (!t || Math.abs(now - t) > STRIPE_SIGNATURE_TOLERANCE_S || !sigs.some((s) => equalHex(s, expected))) throw new InvalidSignature("Stripe signature doesn't match");
      const event = JSON.parse(rawBody) as Json;
      const o = event.data?.object ?? {};
      const eventId = String(event.id);
      switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded": {
          // A bank debit can complete before the money arrives; that comes later as async_payment_succeeded.
          if (o.payment_status !== "paid") return [{ kind: "ignored", eventId, type: `${event.type}:${o.payment_status}` }];
          return [await sessionPaid(o, eventId)];
        }
        case "checkout.session.expired":
          return [{ kind: "checkout_expired", eventId, providerRef: o.id }];
        case "invoice.paid":
          // The first year is paid through checkout; only later years are renewals.
          if (o.billing_reason !== "subscription_cycle" || !o.subscription) return [{ kind: "ignored", eventId, type: `${event.type}:${o.billing_reason}` }];
          return [{ kind: "renewed", eventId, match: subMatch(o.subscription), providerPaymentId: o.payment_intent ?? null, amountMinor: o.amount_paid, currency: String(o.currency).toUpperCase() }];
        case "invoice.payment_failed":
          if (o.billing_reason !== "subscription_cycle" || !o.subscription) return [{ kind: "ignored", eventId, type: `${event.type}:${o.billing_reason}` }];
          return [{ kind: "renewal_failed", eventId, match: subMatch(o.subscription), reason: `The card was declined (attempt ${o.attempt_count ?? 1})` }];
        case "customer.subscription.deleted":
          return [{ kind: "subscription_ended", eventId, match: subMatch(o.id) }];
        case "refund.updated":
        case "charge.refund.updated":
          if (o.status === "succeeded") return [{ kind: "refund_succeeded", eventId, providerRefundId: o.id }];
          if (o.status === "failed" || o.status === "canceled") return [{ kind: "refund_failed", eventId, providerRefundId: o.id, reason: o.failure_reason ?? o.status }];
          return [{ kind: "ignored", eventId, type: `${event.type}:${o.status}` }];
        default:
          return [{ kind: "ignored", eventId, type: String(event.type) }];
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Paystack

export const paystackSignature = (secretKey: string, payload: string) => createHmac("sha512", secretKey).update(payload).digest("hex");

/** A successful Paystack charge (from a webhook or a verify call) as the event that makes the pass. */
function chargePaid(d: Json, eventId: string): PaymentEvent {
  const planCode: string | null = d.plan?.plan_code ?? (typeof d.plan === "string" && d.plan ? d.plan : null);
  return {
    kind: "paid",
    eventId,
    orderId: d.metadata?.orderId ?? null,
    providerRef: d.reference,
    providerPaymentId: String(d.id),
    amountMinor: d.amount,
    currency: d.currency,
    subscription: planCode ? { providerSubscriptionId: null, providerCustomerId: d.customer?.customer_code ?? null, data: { planCode } } : null,
  };
}

export function paystackProvider(opts: { secretKey: string; fetch?: Fetch; baseUrl?: string }): PaymentProviderClient {
  const f = opts.fetch ?? fetch;
  const base = opts.baseUrl ?? "https://api.paystack.co";
  const call = async (method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<Json> => {
    const res = await f(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${opts.secretKey}`, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok || json?.status === false) throw new ProviderError(`Paystack: ${json?.message ?? res.statusText}`, res.status);
    return json.data;
  };

  return {
    name: "paystack",
    async checkout(req) {
      let planCode = req.paystackPlanCode ?? undefined;
      let madePlan: string | undefined;
      if (req.recurring && !planCode) {
        const plan = await call("POST", "/plan", { name: req.description, interval: "annually", amount: req.amountMinor, currency: req.currency });
        planCode = madePlan = plan.plan_code;
      }
      const tx = await call("POST", "/transaction/initialize", {
        email: req.email,
        amount: req.amountMinor,
        currency: req.currency,
        reference: req.orderId,
        callback_url: req.returnUrl,
        metadata: { orderId: req.orderId, cancel_action: req.cancelUrl },
        ...(planCode ? { plan: planCode } : {}),
      });
      return { url: tx.authorization_url, providerRef: tx.reference, ...(madePlan ? { paystackPlanCode: madePlan } : {}) };
    },
    async refund(req) {
      const r = await call("POST", "/refund", { transaction: req.providerPaymentId, amount: req.amountMinor, merchant_note: `intu refund ${req.reference}` });
      return { providerRefundId: String(r.id), status: r.status === "processed" ? "succeeded" : "processing" };
    },
    async lookup(providerRef) {
      // "abandoned" only means not paid yet: the member may still finish on the same page.
      const d = await call("GET", `/transaction/verify/${encodeURIComponent(providerRef)}`);
      return d.status === "success" ? chargePaid(d, `charge.success:${d.id}`) : null;
    },
    async setAutoRenew(sub, on) {
      const token = sub.data?.["emailToken"];
      if (!token) throw new ProviderError("Paystack: this subscription has no email token yet", 409);
      await call("POST", on ? "/subscription/enable" : "/subscription/disable", { code: sub.providerSubscriptionId, token });
    },
    async parseWebhook(rawBody, headers) {
      const sig = headers.get("x-paystack-signature") ?? "";
      if (!equalHex(sig, paystackSignature(opts.secretKey, rawBody))) throw new InvalidSignature("Paystack signature doesn't match");
      const event = JSON.parse(rawBody) as Json;
      const d = event.data ?? {};
      // Paystack events carry no id of their own: the event and its object's id make one.
      const eventId = `${event.event}:${d.id ?? d.subscription_code ?? d.reference ?? d.refund_reference ?? ""}`;
      const customer: string | null = d.customer?.customer_code ?? null;
      const planCode: string | null = d.plan?.plan_code ?? (typeof d.plan === "string" ? d.plan : null);
      switch (event.event) {
        case "charge.success": {
          const orderId = d.metadata?.orderId ?? null;
          // A renewal charge is Paystack's own, with the plan but none of our order's details.
          if (!orderId && planCode && customer) return [{ kind: "renewed", eventId, match: { providerCustomerId: customer, planCode }, providerPaymentId: String(d.id), amountMinor: d.amount, currency: d.currency }];
          return [chargePaid(d, eventId)];
        }
        case "subscription.create":
          if (!customer || !planCode) return [{ kind: "ignored", eventId, type: event.event }];
          return [{ kind: "subscription_started", eventId, match: { providerCustomerId: customer, planCode }, providerSubscriptionId: d.subscription_code, data: { planCode, emailToken: d.email_token } }];
        case "invoice.payment_failed": {
          const code = d.subscription?.subscription_code;
          return code ? [{ kind: "renewal_failed", eventId, match: { providerSubscriptionId: code }, reason: d.description ?? "The card was declined" }] : [{ kind: "ignored", eventId, type: event.event }];
        }
        case "subscription.disable":
          return [{ kind: "subscription_ended", eventId, match: { providerSubscriptionId: d.subscription_code } }];
        // Payouts to partners (milestone 7): the reference is the statement's transfer reference.
        case "transfer.success":
          return [{ kind: "transfer_succeeded", eventId, reference: d.reference, transferCode: d.transfer_code ?? null }];
        case "transfer.failed":
        case "transfer.reversed":
          return [{ kind: "transfer_failed", eventId, reference: d.reference, transferCode: d.transfer_code ?? null, reason: event.event === "transfer.reversed" ? "The bank sent the transfer back" : (d.reason ?? d.gateway_response ?? "The transfer failed") }];
        case "refund.processed":
          return [{ kind: "refund_succeeded", eventId, providerRefundId: String(d.id) }];
        case "refund.failed":
          return [{ kind: "refund_failed", eventId, providerRefundId: String(d.id), reason: d.reason ?? "Refund failed" }];
        default:
          return [{ kind: "ignored", eventId, type: String(event.event) }];
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// TEST: no money moves. A page on the API stands in for the payment page; never in production.

export function testProvider(): PaymentProviderClient {
  let refunds = 0;
  return {
    name: "test",
    async checkout(req) {
      return { url: `${req.apiUrl}/payments/test/${req.orderId}`, providerRef: `test_${req.orderId}` };
    },
    async refund() {
      refunds += 1;
      return { providerRefundId: `test_refund_${Date.now()}_${refunds}`, status: "succeeded" };
    },
    async setAutoRenew() {},
    async lookup() {
      return null;
    },
    async parseWebhook() {
      throw new InvalidSignature("The TEST provider has no webhooks");
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Payouts: naira transfers to partners' bank accounts (Paystack Transfers).

export type TransferStatus = "success" | "pending" | "failed";

export interface PayoutClient {
  name: "paystack" | "test";
  banks(): Promise<{ name: string; code: string }[]>;
  /** The account holder's name as the bank has it; throws ProviderError if there's no such account. */
  resolveAccount(accountNumber: string, bankCode: string): Promise<{ accountName: string }>;
  /** Paystack's transfer recipient for the account. */
  createRecipient(r: { name: string; accountNumber: string; bankCode: string }): Promise<{ recipientCode: string }>;
  /** Sends naira; the reference is ours and one per attempt, so a retry never pays twice. */
  transfer(t: { amountMinor: number; recipientCode: string; reference: string; reason: string }): Promise<{ transferCode: string | null; status: TransferStatus; reason?: string }>;
  /** The transfer's outcome, in case its webhook is late or lost. */
  verifyTransfer(reference: string): Promise<{ transferCode: string | null; status: TransferStatus; reason?: string }>;
}

const transferStatus = (d: Json): { transferCode: string | null; status: TransferStatus; reason?: string } => {
  const code = d.transfer_code ?? null;
  if (d.status === "success") return { transferCode: code, status: "success" };
  if (d.status === "failed" || d.status === "reversed" || d.status === "abandoned" || d.status === "rejected") return { transferCode: code, status: "failed", reason: d.reason ?? `Paystack: transfer ${d.status}` };
  // An OTP stops API transfers: they need turning off in Paystack's settings.
  if (d.status === "otp") return { transferCode: code, status: "failed", reason: "Paystack is asking for an OTP. Turn off OTP for transfers in Paystack (Settings → Preferences), then send it again." };
  return { transferCode: code, status: "pending" };
};

export function paystackPayouts(opts: { secretKey: string; fetch?: Fetch; baseUrl?: string }): PayoutClient {
  const f = opts.fetch ?? fetch;
  const base = opts.baseUrl ?? "https://api.paystack.co";
  const call = async (method: "GET" | "POST", path: string, body?: Record<string, unknown>): Promise<Json> => {
    const res = await f(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${opts.secretKey}`, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const json = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok || json?.status === false) throw new ProviderError(`Paystack: ${json?.message ?? res.statusText}`, res.status);
    return json.data;
  };
  return {
    name: "paystack",
    async banks() {
      const list = (await call("GET", "/bank?country=nigeria&currency=NGN&perPage=100")) as Json[];
      return list.filter((b) => b.active !== false && !b.is_deleted).map((b) => ({ name: String(b.name), code: String(b.code) }));
    },
    async resolveAccount(accountNumber, bankCode) {
      const d = await call("GET", `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`);
      return { accountName: String(d.account_name) };
    },
    async createRecipient(r) {
      const d = await call("POST", "/transferrecipient", { type: "nuban", name: r.name, account_number: r.accountNumber, bank_code: r.bankCode, currency: "NGN" });
      return { recipientCode: String(d.recipient_code) };
    },
    async transfer(t) {
      return transferStatus(await call("POST", "/transfer", { source: "balance", amount: t.amountMinor, recipient: t.recipientCode, reference: t.reference, reason: t.reason, currency: "NGN" }));
    },
    async verifyTransfer(reference) {
      return transferStatus(await call("GET", `/transfer/verify/${encodeURIComponent(reference)}`));
    },
  };
}

/** TEST payouts: no money moves. One TEST bank, whose accounts all resolve, and every transfer succeeds. */
export function testPayouts(): PayoutClient {
  return {
    name: "test",
    async banks() {
      return [{ name: "TEST Bank", code: "999" }];
    },
    async resolveAccount(accountNumber) {
      if (!/^\d{10}$/.test(accountNumber)) throw new ProviderError("TEST: account numbers have 10 digits", 422);
      return { accountName: `TEST ACCOUNT ${accountNumber.slice(-4)}` };
    },
    async createRecipient(r) {
      return { recipientCode: `RCP_test_${r.accountNumber.slice(-4)}` };
    },
    async transfer(t) {
      return { transferCode: `TRF_test_${t.reference.slice(-8)}`, status: "success" };
    },
    async verifyTransfer(reference) {
      return { transferCode: `TRF_test_${reference.slice(-8)}`, status: "success" };
    },
  };
}

/** Which client takes a currency: the real provider when its keys are set, else TEST (not in production). */
export interface Payments {
  forCurrency(currency: Currency): PaymentProviderClient;
  byName(name: ProviderName): PaymentProviderClient | null;
  /** The API's public address, if set; otherwise the address each request came in on. */
  apiUrl: string | null;
  /** Naira payouts to partners: Paystack Transfers, or TEST outside production; null if neither. */
  payouts: PayoutClient | null;
}
