// Buying from the member app (plans on sale, checkout, receipts, auto-renew, Crew invites), the
// providers' webhooks, the page members land on after paying, and the TEST payment page.
import { Hono } from "hono";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { schema, type Db } from "@intu/db";
import { CURRENCIES, defaultCurrency, holdsPlan, passTerms, saleStatus, toLagos } from "@intu/rules";
import type { TokenVerifier } from "../auth/tokens.ts";
import { idParam, uuid } from "../admin/validation.ts";
import { body, fail } from "../http.ts";
import { needMember, requireMember, type MemberEnv } from "../member/routes.ts";
import { InvalidSignature, type Payments } from "./providers.ts";
import { passesOf, type PaymentService } from "./service.ts";

const { benefits, categories, orders, planPrices, plans, refunds, subscriptions } = schema;
const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/, "Use international format, e.g. +2348012345678");

/** A plain page in the intu colours, for the few screens the API shows in a browser. */
const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
  `<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0D0B1A;color:#FFF5E6;font:16px/1.5 system-ui,sans-serif}` +
  `main{max-width:26rem;padding:2rem;text-align:center}h1{font-size:1.6rem;margin:0 0 .5rem}p{opacity:.8}` +
  `a,button{display:block;width:100%;margin-top:1rem;padding:.9rem;border-radius:999px;border:0;font:600 1rem system-ui;text-decoration:none;cursor:pointer}` +
  `.go{background:#FFB020;color:#0D0B1A}.no{background:transparent;color:#FFF5E6;border:1px solid #FFF5E633}.tag{color:#FF6B6B;font-weight:700}</style></head><body><main>${body}</main></body></html>`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function paymentRoutes(deps: { db: Db; verify: TokenVerifier; payments: Payments; service: PaymentService; clock: () => Date; allowTestPayments: boolean }) {
  const { db, service } = deps;
  const app = new Hono<MemberEnv>();
  const signedIn = requireMember(deps);
  const today = () => toLagos(deps.clock()).date;

  // Plans on sale today, with their prices and what they include.
  app.get("/plans", signedIn, async (c) => {
    const member = needMember(c);
    const rows = (await db.select().from(plans).where(eq(plans.active, true)).orderBy(asc(plans.name))).filter((p) => saleStatus(p, today()).onSale && (member.isTest || !p.isTest));
    if (!rows.length) return c.json({ plans: [], currency: defaultCurrency(member) });
    const ids = rows.map((p) => p.id);
    const mine = await passesOf(db, member.id);
    const prices = await db.select().from(planPrices).where(inArray(planPrices.planId, ids));
    const included = await db
      .select({ planId: benefits.planId, name: categories.name, code: categories.code, quantity: benefits.quantity, period: benefits.period })
      .from(benefits)
      .innerJoin(categories, eq(categories.id, benefits.categoryId))
      .where(inArray(benefits.planId, ids))
      .orderBy(asc(categories.code));
    return c.json({
      currency: defaultCurrency(member),
      plans: rows
        .map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          crewSize: p.groupSize,
          // Already holding this plan: it can't be bought again until that pass ends.
          held: holdsPlan(mine, p.id, today()),
          ...passTerms(p, today()),
          prices: prices.filter((x) => x.planId === p.id).map((x) => ({ currency: x.currency, amountMinor: x.amountMinor })),
          benefits: included.filter((b) => b.planId === p.id).map(({ planId: _p, ...b }) => b),
        }))
        .filter((p) => p.prices.length > 0),
    });
  });

  app.post("/checkout", signedIn, async (c) => {
    const member = needMember(c);
    const input = await body(c, z.object({ planId: uuid, currency: z.enum(CURRENCIES), email: z.email().max(200).optional() }));
    if (input.email && input.email !== member.email) await db.update(schema.members).set({ email: input.email }).where(eq(schema.members.id, member.id));
    return c.json(await service.startCheckout(member.id, input, new URL(c.req.url).origin), 201);
  });

  const receipts = async (memberId: string, id?: string) => {
    const rows = await db
      .select({ order: orders, plan: { id: plans.id, name: plans.name } })
      .from(orders)
      .innerJoin(plans, eq(plans.id, orders.planId))
      .where(and(eq(orders.memberId, memberId), ...(id ? [eq(orders.id, id)] : [])))
      .orderBy(desc(orders.createdAt))
      .limit(50);
    const refundRows = rows.length ? await db.select().from(refunds).where(inArray(refunds.orderId, rows.map((r) => r.order.id))) : [];
    return rows
      .filter((r) => id || r.order.status !== "pending" || r.order.createdAt.getTime() > deps.clock().getTime() - 86_400_000)
      .map(({ order: o, plan }) => ({
        id: o.id,
        kind: o.kind,
        status: o.status,
        plan,
        currency: o.currency,
        amountMinor: o.amountMinor,
        paidAt: o.paidAt,
        createdAt: o.createdAt,
        membershipId: o.membershipId,
        refundedMinor: refundRows.filter((r) => r.orderId === o.id && r.status === "succeeded").reduce((n, r) => n + r.amountMinor, 0),
      }));
  };

  app.get("/me/orders", signedIn, async (c) => c.json({ orders: await receipts(needMember(c).id) }));

  // The app checks this while it waits after the payment page: a pending order is also checked
  // with the provider, in case the webhook is late.
  app.get("/me/orders/:id", signedIn, async (c) => {
    const { id } = idParam.parse(c.req.param());
    const [pending] = await receipts(needMember(c).id, id);
    if (pending?.status === "pending") await service.reconcile(id);
    const [order] = await receipts(needMember(c).id, id);
    if (!order) fail(404, "not_found", "Order not found");
    return c.json({ order });
  });

  app.get("/me/subscriptions", signedIn, async (c) => {
    const member = needMember(c);
    const rows = await db
      .select({ sub: subscriptions, plan: { id: plans.id, name: plans.name } })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(eq(subscriptions.memberId, member.id))
      .orderBy(desc(subscriptions.createdAt));
    return c.json({
      subscriptions: rows.map(({ sub: s, plan }) => ({ id: s.id, plan, status: s.status, autoRenew: s.status !== "cancelled" && !s.cancelAtPeriodEnd, currency: s.currency, amountMinor: s.amountMinor, currentMembershipId: s.currentMembershipId, lastFailureReason: s.status === "past_due" ? s.lastFailureReason : null })),
    });
  });

  app.post("/me/subscriptions/:id/auto-renew", signedIn, async (c) => {
    const { id } = idParam.parse(c.req.param());
    const { on } = await body(c, z.object({ on: z.boolean() }));
    await service.setAutoRenew(needMember(c).id, id, on);
    return c.json({ ok: true });
  });

  // Crew: the buyer invites the rest by phone; each invite becomes a pass when accepted.
  app.get("/me/crew/:id", signedIn, async (c) => {
    const { id } = idParam.parse(c.req.param());
    const crew = await service.crewOf(needMember(c).id, id);
    return c.json({ plan: { id: crew.plan.id, name: crew.plan.name, crewSize: crew.plan.groupSize }, isBuyer: crew.isBuyer, seatsLeft: crew.seatsLeft, crew: crew.crew.map((m) => ({ fullName: m.fullName, isMe: m.memberId === needMember(c).id })), invites: crew.invites.map((i) => ({ id: i.id, fullName: i.fullName, phone: i.phone })) });
  });

  app.post("/me/crew/:id/invites", signedIn, async (c) => {
    const { id } = idParam.parse(c.req.param());
    const person = await body(c, z.object({ fullName: z.string().trim().min(2).max(120), phone: e164 }));
    const member = needMember(c);
    if (person.phone === member.phone) fail(422, "own_number", "That's your own number");
    await service.invite(member.id, id, person);
    return c.json({ ok: true }, 201);
  });

  app.post("/me/invites/:id/cancel", signedIn, async (c) => {
    const { id } = idParam.parse(c.req.param());
    await service.cancelInvite(needMember(c).id, id);
    return c.json({ ok: true });
  });

  app.get("/me/invites", signedIn, async (c) => c.json({ invites: await service.invitesFor(needMember(c).phone) }));

  app.post("/me/invites/:id/accept", signedIn, async (c) => {
    const { id } = idParam.parse(c.req.param());
    await service.acceptInvite(needMember(c), id);
    return c.json({ ok: true });
  });

  // The providers' webhooks: the raw body is what their signature covers.
  for (const name of ["stripe", "paystack"] as const) {
    app.post(`/webhooks/${name}`, async (c) => {
      const client = deps.payments.byName(name);
      if (!client || client.name !== name) fail(404, "not_configured", `${name} isn't set up`);
      const raw = await c.req.text();
      let events;
      try {
        events = await client.parseWebhook(raw, c.req.raw.headers);
      } catch (err) {
        if (err instanceof InvalidSignature) fail(400, "bad_signature", "Signature doesn't match");
        throw err;
      }
      for (const event of events) await service.applyEvent(name, event);
      return c.json({ received: true });
    });
  }

  // Where the payment page sends the member back to: they return to the app, which checks the order.
  app.get("/payments/return", (c) => {
    const done = c.req.query("status") !== "cancelled";
    return c.html(
      page(
        done ? "Thank you" : "Payment not finished",
        done
          ? `<h1>Thank you</h1><p>Your payment is being confirmed. Go back to the intu app: your pass appears in a moment.</p><a class="go" href="intu://">Open intu</a>`
          : `<h1>Payment not finished</h1><p>Nothing was taken. Go back to the intu app to try again.</p><a class="go" href="intu://">Open intu</a>`,
      ),
    );
  });

  // TEST payments: a stand-in for the provider's page, with no money involved. Never in production.
  if (deps.allowTestPayments) {
    app.get("/payments/test/:id", async (c) => {
      const { id } = idParam.parse(c.req.param());
      const [row] = await db.select({ order: orders, plan: plans }).from(orders).innerJoin(plans, eq(plans.id, orders.planId)).where(and(eq(orders.id, id), eq(orders.provider, "test")));
      if (!row) return c.html(page("Not found", "<h1>Order not found</h1>"), 404);
      const amount = new Intl.NumberFormat("en-GB", { style: "currency", currency: row.order.currency }).format(row.order.amountMinor / 100);
      return c.html(
        page(
          "TEST payment",
          `<p class="tag">TEST: no money moves</p><h1>${esc(row.plan.name)}</h1><p>${amount}</p>` +
            (row.order.status === "pending"
              ? `<form method="post"><button class="go" name="action" value="pay">Pay ${amount} (TEST)</button><button class="no" name="action" value="cancel">Cancel</button></form>`
              : `<p>This order is ${row.order.status}.</p><a class="go" href="intu://">Open intu</a>`),
        ),
      );
    });
    app.post("/payments/test/:id", async (c) => {
      const { id } = idParam.parse(c.req.param());
      const form = await c.req.parseBody();
      const [order] = await db.select().from(orders).where(and(eq(orders.id, id), eq(orders.provider, "test")));
      if (!order) return c.html(page("Not found", "<h1>Order not found</h1>"), 404);
      if (form["action"] === "pay") {
        const plan = (await db.select().from(plans).where(eq(plans.id, order.planId)))[0];
        const renews = plan ? passTerms(plan, today()).renews : false;
        await service.applyEvent("test", {
          kind: "paid",
          eventId: `pay:${order.id}`,
          orderId: order.id,
          providerRef: order.providerRef ?? `test_${order.id}`,
          providerPaymentId: `test_payment_${order.id}`,
          amountMinor: order.amountMinor,
          currency: order.currency,
          subscription: renews ? { providerSubscriptionId: `test_sub_${order.id}`, providerCustomerId: `test_customer_${order.memberId}` } : null,
        });
        return c.redirect(`/payments/return?order=${order.id}&status=done`, 303);
      }
      await service.applyEvent("test", { kind: "checkout_expired", eventId: `cancel:${order.id}`, providerRef: order.providerRef ?? "" });
      return c.redirect(`/payments/return?order=${order.id}&status=cancelled`, 303);
    });
  }

  return app;
}
