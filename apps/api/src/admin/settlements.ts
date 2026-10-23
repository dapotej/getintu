// Settlements in the console (spec: Admin console, Settlements and payouts; main role Finance):
// run a month's statements, adjust and hold lines, approve, pay by Paystack transfer or record a
// payment, and set where each partner is paid.
import { Hono } from "hono";
import { and, asc, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { schema, type Db } from "@intu/db";
import { approvalCheck, payoutCheck, previousMonth, toLagos } from "@intu/rules";
import { requirePermission, type AdminEnv } from "../auth/staff.ts";
import { body, fail, query } from "../http.ts";
import type { Payments } from "../payments/providers.ts";
import { CANNOT_APPROVE, CANNOT_PAY, type SettlementService } from "../settlements/service.ts";
import { idParam, uuid } from "./validation.ts";

const { categories, members, partners, redemptions, settlementAdjustments, settlements, staffUsers, venues } = schema;
const changers = alias(staffUsers, "changers");
const approvers = alias(staffUsers, "approvers");
const payers = alias(staffUsers, "payers");

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "A month, YYYY-MM");
const reason = z.string().trim().min(3).max(500);

/** The partner's payout account as the console shows it: never the account number. */
export const payoutAccount = (p: typeof partners.$inferSelect) =>
  p.payoutRecipientCode ? { bankName: p.payoutBankName, accountLast4: p.payoutAccountLast4, accountName: p.payoutAccountName } : null;

export function settlementAdminRoutes(deps: { db: Db; service: SettlementService; payments: Payments; clock: () => Date }) {
  const { db, service } = deps;
  const app = new Hono<AdminEnv>();
  let bankList: { at: number; banks: { name: string; code: string }[] } | null = null;

  app.get("/settlements", requirePermission("settlements.read"), async (c) => {
    const { status, month: m } = query(c, z.object({ status: z.enum(["draft", "approved", "paying", "paid", "failed", "void"]).optional(), month: month.optional() }));
    const rows = await db
      .select({ settlement: settlements, partner: { id: partners.id, tradingName: partners.tradingName }, changedBy: changers.fullName, approvedBy: approvers.fullName })
      .from(settlements)
      .innerJoin(partners, eq(partners.id, settlements.partnerId))
      .leftJoin(changers, eq(changers.id, settlements.changedById))
      .leftJoin(approvers, eq(approvers.id, settlements.approvedBy))
      .where(and(isNull(settlements.deletedAt), ...(status ? [eq(settlements.status, status)] : []), ...(m ? [eq(settlements.periodStart, `${m}-01`)] : [])))
      .orderBy(desc(settlements.periodStart), asc(partners.tradingName))
      .limit(500);
    // Visits held off statements, by partner, so finance sees what's waiting on them.
    const held = await db
      .select({ partnerId: venues.partnerId, count: sql<number>`count(*)`.mapWith(Number) })
      .from(redemptions)
      .innerJoin(venues, eq(venues.id, redemptions.venueId))
      .where(and(isNotNull(redemptions.settlementHoldReason), isNull(redemptions.settlementId), isNull(redemptions.deletedAt)))
      .groupBy(venues.partnerId);
    return c.json({
      lastMonth: previousMonth(toLagos(deps.clock()).date),
      settlements: rows.map(({ settlement, partner, changedBy, approvedBy }) => ({ ...settlement, partner, changedBy, approvedBy })),
      held: held.reduce((n, h) => n + h.count, 0),
    });
  });

  // Builds (or tops up) every partner's statement for a month; the monthly job runs last month.
  app.post("/settlements/run", requirePermission("settlements.write"), async (c) => {
    const input = await body(c, z.object({ month: month.optional() }));
    const m = input.month ?? previousMonth(toLagos(deps.clock()).date);
    if (`${m}-01` > toLagos(deps.clock()).date) fail(422, "future_month", "That month hasn't started yet");
    return c.json(await service.run(m, { type: "staff", id: c.get("staff").id }));
  });

  app.get("/settlements/:id", requirePermission("settlements.read"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    // A statement waiting on its transfer asks Paystack first, in case the webhook is late.
    await service.reconcile(id);
    const [row] = await db
      .select({ settlement: settlements, partner: partners, changedBy: changers.fullName, approvedBy: approvers.fullName, paidBy: payers.fullName })
      .from(settlements)
      .innerJoin(partners, eq(partners.id, settlements.partnerId))
      .leftJoin(changers, eq(changers.id, settlements.changedById))
      .leftJoin(approvers, eq(approvers.id, settlements.approvedBy))
      .leftJoin(payers, eq(payers.id, settlements.paidById))
      .where(and(eq(settlements.id, id), isNull(settlements.deletedAt)));
    if (!row) fail(404, "not_found", "Statement not found");
    const lines = await db
      .select({
        id: redemptions.id,
        occurredAt: redemptions.occurredAt,
        serviceDate: redemptions.serviceDate,
        partySize: redemptions.partySize,
        method: redemptions.method,
        flagged: redemptions.flagged,
        amountMinor: redemptions.settledAmountMinor,
        venue: venues.name,
        service: categories.name,
        member: members.fullName,
      })
      .from(redemptions)
      .innerJoin(venues, eq(venues.id, redemptions.venueId))
      .innerJoin(categories, eq(categories.id, redemptions.categoryId))
      .innerJoin(members, eq(members.id, redemptions.memberId))
      .where(and(eq(redemptions.settlementId, id), isNull(redemptions.deletedAt)))
      .orderBy(asc(redemptions.occurredAt));
    const adjustments = await db
      .select({ id: settlementAdjustments.id, amountMinor: settlementAdjustments.amountMinor, reason: settlementAdjustments.reason, createdAt: settlementAdjustments.createdAt, createdBy: staffUsers.fullName })
      .from(settlementAdjustments)
      .innerJoin(staffUsers, eq(staffUsers.id, settlementAdjustments.createdById))
      .where(and(eq(settlementAdjustments.settlementId, id), isNull(settlementAdjustments.deletedAt)))
      .orderBy(asc(settlementAdjustments.createdAt));
    const held = await db
      .select({ id: redemptions.id, serviceDate: redemptions.serviceDate, reason: redemptions.settlementHoldReason, venue: venues.name, service: categories.name, member: members.fullName })
      .from(redemptions)
      .innerJoin(venues, eq(venues.id, redemptions.venueId))
      .innerJoin(categories, eq(categories.id, redemptions.categoryId))
      .innerJoin(members, eq(members.id, redemptions.memberId))
      .where(and(eq(venues.partnerId, row.partner.id), isNotNull(redemptions.settlementHoldReason), isNull(redemptions.settlementId), isNull(redemptions.deletedAt)))
      .orderBy(asc(redemptions.occurredAt));
    const staff = c.get("staff");
    const approval = approvalCheck(row.settlement, staff);
    const payout = payoutCheck(row.settlement, row.partner);
    return c.json({
      settlement: { ...row.settlement, changedBy: row.changedBy, approvedBy: row.approvedBy, paidBy: row.paidBy },
      partner: { id: row.partner.id, tradingName: row.partner.tradingName, legalName: row.partner.legalName, payoutAccount: payoutAccount(row.partner) },
      lines,
      adjustments,
      held,
      // What the person looking can do, and why not, for the buttons.
      canApprove: approval.ok ? { ok: true } : { ok: false, reason: approval.reason, message: CANNOT_APPROVE[approval.reason] },
      canPay: payout.ok ? { ok: true } : { ok: false, reason: payout.reason, message: CANNOT_PAY[payout.reason] },
    });
  });

  app.post("/settlements/:id/adjustments", requirePermission("settlements.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, z.object({ amountMinor: z.number().int().refine((n) => n !== 0, "Not zero"), reason }));
    return c.json({ settlement: await service.addAdjustment(id, input, c.get("staff").id) }, 201);
  });

  app.delete("/settlements/:id/adjustments/:adjustmentId", requirePermission("settlements.write"), async (c) => {
    const { id, adjustmentId } = z.object({ id: uuid, adjustmentId: uuid }).parse(c.req.param());
    return c.json({ settlement: await service.removeAdjustment(id, adjustmentId, c.get("staff").id) });
  });

  app.post("/settlements/:id/lines/:redemptionId/hold", requirePermission("settlements.write"), async (c) => {
    const { id, redemptionId } = z.object({ id: uuid, redemptionId: uuid }).parse(c.req.param());
    const input = await body(c, z.object({ reason }));
    return c.json({ settlement: await service.holdLine(id, redemptionId, input.reason, c.get("staff").id) });
  });

  app.post("/redemptions/:id/release-hold", requirePermission("settlements.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    await service.releaseHold(id, c.get("staff").id);
    return c.json({ ok: true });
  });

  // Needs the person's own approver switch; the role only lets them see statements.
  app.post("/settlements/:id/approve", requirePermission("settlements.read"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    return c.json({ settlement: await service.approve(id, c.get("staff").id) });
  });

  app.post("/settlements/:id/send-back", requirePermission("settlements.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, z.object({ reason }));
    return c.json({ settlement: await service.sendBack(id, input.reason, c.get("staff").id) });
  });

  app.post("/settlements/:id/void", requirePermission("settlements.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, z.object({ reason }));
    return c.json({ settlement: await service.voidStatement(id, input.reason, c.get("staff").id) });
  });

  app.post("/settlements/:id/pay", requirePermission("settlements.pay"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    return c.json({ settlement: await service.pay(id, c.get("staff").id) });
  });

  app.post("/settlements/:id/record-paid", requirePermission("settlements.pay"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, z.object({ reference: z.string().trim().min(3).max(200) }));
    return c.json({ settlement: await service.recordPaid(id, input.reference, c.get("staff").id) });
  });

  // ------------------------------------------------------------------ Where partners are paid

  app.get("/payout-banks", requirePermission("settlements.write"), async (c) => {
    if (!deps.payments.payouts) fail(503, "payouts_not_set_up", "Payouts aren't set up: add the Paystack key");
    const now = deps.clock().getTime();
    if (!bankList || now - bankList.at > 24 * 3600_000) bankList = { at: now, banks: await deps.payments.payouts.banks() };
    return c.json({ banks: bankList.banks, test: deps.payments.payouts.name === "test" });
  });

  app.put("/partners/:id/bank-account", requirePermission("settlements.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, z.object({ bankCode: z.string().trim().min(1).max(20), accountNumber: z.string().trim().regex(/^\d{10}$/, "A 10-digit NUBAN account number") }));
    const { partner, sentBack } = await service.setBankAccount(id, input, c.get("staff").id);
    return c.json({ payoutAccount: payoutAccount(partner), sentBack });
  });

  return app;
}
