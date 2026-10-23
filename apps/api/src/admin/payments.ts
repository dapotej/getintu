// Payments in the console: orders, money taken by currency, failed renewals, and refunds, which
// need a second person above a set amount (spec: Admin console, Payments).
import { Hono } from "hono";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { schema, type Db } from "@intu/db";
import { REFUND_APPROVAL_OVER, refundable, toLagos } from "@intu/rules";
import { requirePermission, type AdminEnv } from "../auth/staff.ts";
import { body, fail, query } from "../http.ts";
import type { PaymentService } from "../payments/service.ts";
import { idParam, minorUnits } from "./validation.ts";

const { members, orders, plans, refunds, staffUsers, subscriptions } = schema;
const requesters = alias(staffUsers, "requesters");
const deciders = alias(staffUsers, "deciders");

export function paymentAdminRoutes(deps: { db: Db; service: PaymentService; clock: () => Date }) {
  const { db, service } = deps;
  const app = new Hono<AdminEnv>();

  const refundsOf = (orderIds: string[]) =>
    db
      .select({ refund: refunds, requestedBy: requesters.fullName, decidedBy: deciders.fullName })
      .from(refunds)
      .innerJoin(requesters, eq(requesters.id, refunds.requestedById))
      .leftJoin(deciders, eq(deciders.id, refunds.decidedById))
      .where(inArray(refunds.orderId, orderIds.length ? orderIds : ["00000000-0000-0000-0000-000000000000"]))
      .orderBy(desc(refunds.createdAt));

  const orderRows = (where: ReturnType<typeof and>, limit = 200) =>
    db
      .select({ order: orders, member: { id: members.id, fullName: members.fullName, phone: members.phone }, plan: { id: plans.id, name: plans.name } })
      .from(orders)
      .innerJoin(members, eq(members.id, orders.memberId))
      .innerJoin(plans, eq(plans.id, orders.planId))
      .where(where)
      .orderBy(desc(orders.createdAt))
      .limit(limit);

  const withRefunds = async (rows: Awaited<ReturnType<typeof orderRows>>) => {
    const all = await refundsOf(rows.map((r) => r.order.id));
    return rows.map(({ order, member, plan }) => {
      const mine = all.filter((r) => r.refund.orderId === order.id);
      return {
        ...order,
        member,
        plan,
        refundable: order.status === "paid" || order.status === "partially_refunded" ? refundable(order.amountMinor, mine.map((r) => r.refund)) : 0,
        refunds: mine.map(({ refund, requestedBy, decidedBy }) => ({ ...refund, requestedBy, decidedBy })),
      };
    });
  };

  app.get("/payments", requirePermission("payments.read"), async (c) => {
    const { status, q } = query(c, z.object({ status: z.enum(["pending", "paid", "failed", "expired", "refunded", "partially_refunded"]).optional(), q: z.string().trim().max(100).optional() }));
    const term = q ? `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
    const rows = await orderRows(and(...(status ? [eq(orders.status, status)] : []), ...(term ? [or(ilike(members.fullName, term), ilike(members.phone, term), ilike(members.email, term))] : [])));

    // Money taken, less refunds, by currency: this month (Lagos) and in all. TEST payments apart.
    const monthStart = new Date(`${toLagos(deps.clock()).month}-01T00:00:00+01:00`);
    const taken = await db
      .select({
        currency: orders.currency,
        isTest: orders.isTest,
        paid: sql<number>`coalesce(sum(${orders.amountMinor}), 0)`.mapWith(Number),
        paidThisMonth: sql<number>`coalesce(sum(${orders.amountMinor}) filter (where ${orders.paidAt} >= ${monthStart.toISOString()}), 0)`.mapWith(Number),
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(orders)
      .where(inArray(orders.status, ["paid", "refunded", "partially_refunded"]))
      .groupBy(orders.currency, orders.isTest);
    const refunded = await db
      .select({ currency: refunds.currency, isTest: orders.isTest, total: sql<number>`coalesce(sum(${refunds.amountMinor}), 0)`.mapWith(Number) })
      .from(refunds)
      .innerJoin(orders, eq(orders.id, refunds.orderId))
      .where(eq(refunds.status, "succeeded"))
      .groupBy(refunds.currency, orders.isTest);
    const totalsOf = (isTest: boolean) =>
      taken
        .filter((t) => t.isTest === isTest)
        .map(({ isTest: _t, ...t }) => ({ ...t, refunded: refunded.find((r) => r.currency === t.currency && r.isTest === isTest)?.total ?? 0 }));

    const failedRenewals = await db
      .select({ sub: subscriptions, member: { id: members.id, fullName: members.fullName, phone: members.phone }, plan: { id: plans.id, name: plans.name } })
      .from(subscriptions)
      .innerJoin(members, eq(members.id, subscriptions.memberId))
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(eq(subscriptions.status, "past_due"))
      .orderBy(desc(subscriptions.lastFailureAt));

    return c.json({
      orders: await withRefunds(rows),
      totals: totalsOf(false),
      testTotals: totalsOf(true),
      failedRenewals: failedRenewals.map(({ sub, member, plan }) => ({ id: sub.id, member, plan, currency: sub.currency, amountMinor: sub.amountMinor, failedAt: sub.lastFailureAt, reason: sub.lastFailureReason })),
      approvalOver: REFUND_APPROVAL_OVER,
    });
  });

  app.get("/orders/:id", requirePermission("payments.read"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const [order] = await withRefunds(await orderRows(and(eq(orders.id, id)), 1));
    if (!order) fail(404, "not_found", "Order not found");
    return c.json({ order });
  });

  /** A member's payments, for the member page. */
  app.get("/members/:id/orders", requirePermission("payments.read"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    return c.json({ orders: await withRefunds(await orderRows(and(eq(orders.memberId, id)))), approvalOver: REFUND_APPROVAL_OVER });
  });

  app.post("/orders/:id/refunds", requirePermission("payments.refund"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, z.object({ amountMinor: minorUnits.refine((n) => n > 0, "More than nothing"), reason: z.string().trim().min(3).max(500), endsPass: z.boolean() }));
    const refund = await service.requestRefund(c.get("staff").id, id, input);
    return c.json({ refund }, 201);
  });

  app.get("/refunds", requirePermission("payments.read"), async (c) => {
    const rows = await db
      .select({ refund: refunds, requestedBy: requesters.fullName, order: orders, member: { id: members.id, fullName: members.fullName }, plan: { name: plans.name } })
      .from(refunds)
      .innerJoin(requesters, eq(requesters.id, refunds.requestedById))
      .innerJoin(orders, eq(orders.id, refunds.orderId))
      .innerJoin(members, eq(members.id, orders.memberId))
      .innerJoin(plans, eq(plans.id, orders.planId))
      .where(eq(refunds.status, "awaiting_approval"))
      .orderBy(refunds.createdAt);
    return c.json({ refunds: rows.map(({ refund, requestedBy, order, member, plan }) => ({ ...refund, requestedBy, order: { id: order.id, amountMinor: order.amountMinor, currency: order.currency, paidAt: order.paidAt }, member, plan })) });
  });

  for (const action of ["approve", "reject"] as const) {
    app.post(`/refunds/:id/${action}`, requirePermission("payments.refund"), async (c) => {
      const { id } = idParam.parse(c.req.param());
      const { note } = await body(c, z.object({ note: action === "reject" ? z.string().trim().min(3).max(500) : z.string().trim().max(500).optional() }));
      const refund = await service.decideRefund(c.get("staff").id, id, action === "approve", note ?? null);
      return c.json({ refund });
    });
  }

  return app;
}
