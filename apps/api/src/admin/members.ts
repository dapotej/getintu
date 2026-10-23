import { Hono } from "hono";
import { and, asc, desc, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { grantAllowances, one, schema, type Db } from "@intu/db";
import { holdsPlan, shiftDate, toLagos } from "@intu/rules";
import { passesOf, type PaymentService } from "../payments/service.ts";
import { requirePermission, type AdminEnv } from "../auth/staff.ts";
import { body, fail, query } from "../http.ts";
import { staffAudit } from "./audited.ts";
import type { PhotoStore } from "../member/photos.ts";
import { idParam, isoDate, uuid } from "./validation.ts";

const { members, memberships, plans, allowances, benefits, categories, clientAccounts, redemptions, vehicles, venues } = schema;

const e164 = z.string().regex(/^\+[1-9]\d{6,14}$/, "Use international format, e.g. +447700900001");
const MemberFields = z.object({
  fullName: z.string().min(2).max(200),
  phone: e164,
  email: z.email().nullable(),
  country: z.string().length(2).toUpperCase().nullable(),
  consentMarketing: z.boolean(),
});

const CreateMembership = z.object({
  planId: uuid,
  startsOn: isoDate.optional(),
  endsOn: isoDate.optional(),
  arrivesOn: isoDate.nullable().optional(),
  departsOn: isoDate.nullable().optional(),
  paymentSource: z.enum(["direct", "client", "gift"]),
  groupId: uuid.nullable().optional(),
  note: z.string().max(500).optional(),
  /** Ops confirmed a second pass on a plan the member already holds. */
  allowSamePlan: z.boolean().optional(),
});

const StatusChange = z.object({ reason: z.string().min(3).max(500) });

export function memberRoutes(db: Db, photos: PhotoStore, payments: Pick<PaymentService, "stopRenewalFor">) {
  const app = new Hono<AdminEnv>();

  app.get("/members", requirePermission("members.read"), async (c) => {
    const { q, limit } = query(c, z.object({ q: z.string().trim().max(100).optional(), limit: z.coerce.number().int().min(1).max(200).default(50) }));
    const term = q ? `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
    const passMatches = term ? db.select({ id: memberships.memberId }).from(memberships).where(ilike(memberships.passNumber, term)) : null;
    const rows = await db
      .select()
      .from(members)
      .where(
        and(
          isNull(members.deletedAt),
          term && passMatches
            ? or(ilike(members.fullName, term), ilike(members.phone, term), ilike(members.email, term), inArray(members.id, passMatches))
            : undefined,
        ),
      )
      .orderBy(asc(members.fullName))
      .limit(limit);
    const ms = rows.length
      ? await db
          .select({ memberId: memberships.memberId, id: memberships.id, status: memberships.status, passNumber: memberships.passNumber, planName: plans.name, endsOn: memberships.endsOn })
          .from(memberships)
          .innerJoin(plans, eq(plans.id, memberships.planId))
          .where(inArray(memberships.memberId, rows.map((r) => r.id)))
      : [];
    return c.json({ members: rows.map((m) => ({ ...m, memberships: ms.filter((x) => x.memberId === m.id) })) });
  });

  const loadMember = async (id: string) => {
    const [member] = await db.select().from(members).where(eq(members.id, id));
    if (!member) fail(404, "not_found", "Member not found");
    const ms = await db
      .select({ membership: memberships, plan: { id: plans.id, name: plans.name, code: plans.code }, client: { id: clientAccounts.id, name: clientAccounts.name } })
      .from(memberships)
      .innerJoin(plans, eq(plans.id, memberships.planId))
      .leftJoin(clientAccounts, eq(clientAccounts.id, memberships.clientAccountId))
      .where(eq(memberships.memberId, id))
      .orderBy(desc(memberships.startsOn));
    const ownerFilter = ms.length
      ? or(
          inArray(allowances.membershipId, ms.map((m) => m.membership.id)),
          ...ms.filter((m) => m.membership.groupId).map((m) => eq(allowances.groupId, m.membership.groupId ?? "")),
        )
      : undefined;
    const allowanceRows = ownerFilter
      ? await db
          .select({ allowance: allowances, category: { code: categories.code, name: categories.name }, planId: benefits.planId, shared: benefits.sharedByGroup })
          .from(allowances)
          .innerJoin(benefits, eq(benefits.id, allowances.benefitId))
          .innerJoin(categories, eq(categories.id, benefits.categoryId))
          .where(ownerFilter)
          .orderBy(asc(categories.code))
      : [];
    const visits = await db
      .select({
        id: redemptions.id,
        occurredAt: redemptions.occurredAt,
        serviceDate: redemptions.serviceDate,
        venueName: venues.name,
        category: { code: categories.code, name: categories.name },
        result: redemptions.result,
        reason: redemptions.reason,
        method: redemptions.method,
        partySize: redemptions.partySize,
        reversedAt: redemptions.deletedAt,
        vehiclePlate: vehicles.plate,
      })
      .from(redemptions)
      .innerJoin(venues, eq(venues.id, redemptions.venueId))
      .leftJoin(vehicles, eq(vehicles.id, redemptions.vehicleId))
      .innerJoin(categories, eq(categories.id, redemptions.categoryId))
      .where(eq(redemptions.memberId, id))
      .orderBy(desc(redemptions.occurredAt))
      .limit(50);
    return {
      // The photo link lasts an hour: long enough to look at, not to pass around.
      member: { ...member, photoUrl: member.photoPath ? await photos.signedUrl(member.photoPath, 3600).catch(() => null) : null },
      memberships: ms.map(({ membership, plan, client }) => ({
        ...membership,
        plan,
        client,
        allowances: allowanceRows
          .filter((a) => a.allowance.membershipId === membership.id || (a.allowance.groupId !== null && a.allowance.groupId === membership.groupId))
          .map((a) => ({ ...a.allowance, category: a.category, shared: a.allowance.groupId !== null })),
      })),
      visits,
    };
  };

  app.get("/members/:id", requirePermission("members.read"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    return c.json(await loadMember(id));
  });

  app.post("/members", requirePermission("members.write"), async (c) => {
    const input = await body(c, MemberFields.partial().required({ fullName: true, phone: true }));
    const staff = c.get("staff");
    const row = await db.transaction(async (tx) => {
      const [dup] = await tx.select({ id: members.id }).from(members).where(eq(members.phone, input.phone));
      if (dup) fail(409, "duplicate_phone", "A member with this phone number already exists");
      const created = one(await tx.insert(members).values(input).returning());
      await staffAudit(tx, staff, "member.created", "member", created.id, null, created);
      return created;
    });
    return c.json(await loadMember(row.id), 201);
  });

  app.patch("/members/:id", requirePermission("members.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, MemberFields.partial());
    const staff = c.get("staff");
    await db.transaction(async (tx) => {
      const [before] = await tx.select().from(members).where(eq(members.id, id)).for("update");
      if (!before) fail(404, "not_found", "Member not found");
      if (input.phone && input.phone !== before.phone) {
        const [dup] = await tx.select({ id: members.id }).from(members).where(eq(members.phone, input.phone));
        if (dup) fail(409, "duplicate_phone", "A member with this phone number already exists");
      }
      const after = one(await tx.update(members).set(input).where(eq(members.id, id)).returning());
      await staffAudit(tx, staff, "member.updated", "member", id, before, after);
    });
    return c.json(await loadMember(id));
  });

  // Adds a membership by hand (gifts, client accounts, fixes) and grants its allowances.
  // Paid memberships arrive through checkout webhooks in milestone 6.
  app.post("/members/:id/memberships", requirePermission("members.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, CreateMembership);
    const staff = c.get("staff");
    await db.transaction(async (tx) => {
      const [member] = await tx.select({ id: members.id }).from(members).where(eq(members.id, id));
      if (!member) fail(404, "not_found", "Member not found");
      const [plan] = await tx.select().from(plans).where(eq(plans.id, input.planId));
      if (!plan) fail(422, "unknown_plan", "Plan not found");
      if (!input.allowSamePlan && holdsPlan(await passesOf(tx, id), plan.id, toLagos(new Date()).date)) fail(409, "already_have_plan", "This member already has a current pass on this plan");
      // A season plan runs for its season; a rolling plan (annual) its length from the start, today by default.
      const startsOn = input.startsOn ?? plan.seasonStartsOn ?? (plan.durationDays ? toLagos(new Date()).date : null);
      const endsOn = input.endsOn ?? plan.seasonEndsOn ?? (plan.durationDays && startsOn ? shiftDate(startsOn, plan.durationDays - 1) : null);
      if (!startsOn || !endsOn) fail(400, "dates_required", "This plan has no season dates or length; give startsOn and endsOn");
      if (endsOn < startsOn) fail(400, "invalid_dates", "endsOn is before startsOn");
      const created = one(await tx
        .insert(memberships)
        .values({
          memberId: id,
          planId: plan.id,
          startsOn,
          endsOn,
          arrivesOn: input.arrivesOn ?? null,
          departsOn: input.departsOn ?? null,
          status: "active",
          paymentSource: input.paymentSource,
          groupId: input.groupId ?? null,
        })
        .returning());
      await staffAudit(tx, staff, "membership.created", "membership", created.id, null, { ...created, note: input.note ?? null });
      await grantAllowances(tx, created.id, { type: "staff", id: staff.id });
    });
    return c.json(await loadMember(id), 201);
  });

  const setStatus = (from: "active" | "suspended", to: "active" | "suspended", action: string) =>
    app.post(`/memberships/:id/${action}`, requirePermission("members.write"), async (c) => {
      const { id } = idParam.parse(c.req.param());
      const { reason } = await body(c, StatusChange);
      const staff = c.get("staff");
      const memberId = await db.transaction(async (tx) => {
        const [before] = await tx.select().from(memberships).where(eq(memberships.id, id)).for("update");
        if (!before) fail(404, "not_found", "Membership not found");
        if (before.status !== from) fail(409, "invalid_status", `Only ${from} memberships can be ${action === "suspend" ? "suspended" : "reinstated"}`);
        const after = one(await tx.update(memberships).set({ status: to }).where(eq(memberships.id, id)).returning());
        await staffAudit(tx, staff, `membership.${action === "suspend" ? "suspended" : "reinstated"}`, "membership", id, before, { ...after, reason });
        return before.memberId;
      });
      return c.json(await loadMember(memberId));
    });
  setStatus("active", "suspended", "suspend");
  setStatus("suspended", "active", "reinstate");

  // Ends a pass for good (unlike a suspension): the scanner declines it, the member can be given the
  // plan again, and any auto-renewal stops. Money is refunded separately, from Payments.
  app.post("/memberships/:id/cancel", requirePermission("members.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const { reason } = await body(c, StatusChange);
    const staff = c.get("staff");
    const memberId = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(memberships).where(eq(memberships.id, id)).for("update");
      if (!before) fail(404, "not_found", "Membership not found");
      if (before.status === "cancelled" || before.status === "ended") fail(409, "invalid_status", "This pass has already ended");
      const after = one(await tx.update(memberships).set({ status: "cancelled" }).where(eq(memberships.id, id)).returning());
      await staffAudit(tx, staff, "membership.cancelled", "membership", id, before, { ...after, reason });
      return before.memberId;
    });
    await payments.stopRenewalFor(id, { type: "staff", id: staff.id });
    return c.json(await loadMember(memberId));
  });

  return app;
}
