// The partner portal's Money area (spec: Partner app, Portal): a venue manager's statements, once
// intu has approved them, with payout status and each visit behind the total. Partners see the
// member's name only, never their phone or email.
import { Hono } from "hono";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { schema, type Db } from "@intu/db";
import { fail } from "../http.ts";
import { idParam } from "../admin/validation.ts";
import { requireDoorStaff, type PartnerEnv } from "./session.ts";

const { categories, members, redemptions, settlementAdjustments, settlements, venues } = schema;
// Drafts are intu's work in progress, and voided statements were never owed.
const SHOWN = ["approved", "paying", "paid", "failed"] as const;
/** What partners are told: a failed transfer is still being paid, from their side. */
const payoutStatus = (s: string) => (s === "paid" ? "paid" : "approved");

export function partnerStatementRoutes(deps: { db: Db; partnerSessionSecret: string; clock: () => Date }) {
  const { db } = deps;
  const app = new Hono<PartnerEnv>();
  const signedIn = requireDoorStaff(deps);
  const managerOnly = (c: { get: (k: "door") => { role: string } }) => {
    if (c.get("door").role !== "venue_manager") fail(403, "managers_only", "Statements are for venue managers");
  };

  app.get("/partner/statements", signedIn, async (c) => {
    managerOnly(c);
    const rows = await db
      .select()
      .from(settlements)
      .where(and(eq(settlements.partnerId, c.get("door").partnerId), inArray(settlements.status, [...SHOWN]), isNull(settlements.deletedAt)))
      .orderBy(desc(settlements.periodStart));
    return c.json({
      statements: rows.map((s) => ({ id: s.id, periodStart: s.periodStart, periodEnd: s.periodEnd, totalMinor: s.totalMinor, currency: s.currency, visits: s.lineCount, status: payoutStatus(s.status), paidAt: s.status === "paid" ? s.paidAt : null, paymentReference: s.status === "paid" ? s.paymentReference : null })),
    });
  });

  app.get("/partner/statements/:id", signedIn, async (c) => {
    managerOnly(c);
    const { id } = idParam.parse(c.req.param());
    const [s] = await db
      .select()
      .from(settlements)
      .where(and(eq(settlements.id, id), eq(settlements.partnerId, c.get("door").partnerId), inArray(settlements.status, [...SHOWN]), isNull(settlements.deletedAt)));
    if (!s) fail(404, "not_found", "Statement not found");
    const lines = await db
      .select({ id: redemptions.id, occurredAt: redemptions.occurredAt, serviceDate: redemptions.serviceDate, partySize: redemptions.partySize, amountMinor: redemptions.settledAmountMinor, venue: venues.name, service: categories.name, member: members.fullName })
      .from(redemptions)
      .innerJoin(venues, eq(venues.id, redemptions.venueId))
      .innerJoin(categories, eq(categories.id, redemptions.categoryId))
      .innerJoin(members, eq(members.id, redemptions.memberId))
      .where(and(eq(redemptions.settlementId, s.id), isNull(redemptions.deletedAt)))
      .orderBy(asc(redemptions.occurredAt));
    const adjustments = await db
      .select({ id: settlementAdjustments.id, amountMinor: settlementAdjustments.amountMinor, reason: settlementAdjustments.reason })
      .from(settlementAdjustments)
      .where(and(eq(settlementAdjustments.settlementId, s.id), isNull(settlementAdjustments.deletedAt)))
      .orderBy(asc(settlementAdjustments.createdAt));
    return c.json({
      statement: { id: s.id, periodStart: s.periodStart, periodEnd: s.periodEnd, totalMinor: s.totalMinor, linesMinor: s.linesMinor, currency: s.currency, status: payoutStatus(s.status), paidAt: s.status === "paid" ? s.paidAt : null, paymentReference: s.status === "paid" ? s.paymentReference : null },
      lines,
      adjustments,
    });
  });

  return app;
}
