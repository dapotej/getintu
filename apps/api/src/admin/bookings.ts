// Bookings made by intu ops for a member (until the member app can request them), and reversing
// a visit that didn't happen.
import { Hono } from "hono";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { one, schema, type Db } from "@intu/db";
import { requirePermission, type AdminEnv } from "../auth/staff.ts";
import { body, fail } from "../http.ts";
import { CannotReverseError, reverseRedemption } from "../ledger/reverse.ts";
import { staffAudit } from "./audited.ts";
import { idParam, isoDate, uuid } from "./validation.ts";

const { bookings, categories, memberships, offers, venues } = schema;

const NewBooking = z.object({
  membershipId: uuid,
  venueId: uuid,
  offerId: uuid.nullable().default(null),
  bookingDate: isoDate,
  partySize: z.number().int().min(1).max(20).default(1),
  notes: z.string().trim().max(1000).nullable().default(null),
});

export function bookingRoutes(deps: { db: Db; clock: () => Date }) {
  const { db } = deps;
  const app = new Hono<AdminEnv>();

  const listFor = (memberId: string) =>
    db
      .select({
        id: bookings.id,
        membershipId: bookings.membershipId,
        bookingDate: bookings.bookingDate,
        partySize: bookings.partySize,
        status: bookings.status,
        notes: bookings.notes,
        redemptionId: bookings.redemptionId,
        venue: { id: venues.id, name: venues.name, partnerId: venues.partnerId, kind: venues.kind },
        offerName: categories.name,
      })
      .from(bookings)
      .leftJoin(venues, eq(venues.id, bookings.venueId))
      .leftJoin(offers, eq(offers.id, bookings.offerId))
      .leftJoin(categories, eq(categories.id, offers.categoryId))
      .where(eq(bookings.memberId, memberId))
      .orderBy(desc(bookings.bookingDate));

  app.get("/members/:id/bookings", requirePermission("members.read"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    return c.json({ bookings: await listFor(id) });
  });

  // Ops book on the member's behalf once the partner has agreed, so the booking starts confirmed.
  app.post("/members/:id/bookings", requirePermission("members.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, NewBooking);
    const [ms] = await db.select().from(memberships).where(and(eq(memberships.id, input.membershipId), eq(memberships.memberId, id), isNull(memberships.deletedAt)));
    if (!ms) fail(422, "unknown_membership", "That pass isn't this member's");
    const [venue] = await db.select().from(venues).where(and(eq(venues.id, input.venueId), isNull(venues.deletedAt)));
    if (!venue) fail(422, "unknown_venue", "Venue not found");
    if (input.offerId) {
      const [offer] = await db.select({ id: offers.id }).from(offers).where(and(eq(offers.id, input.offerId), eq(offers.venueId, venue.id)));
      if (!offer) fail(422, "unknown_offer", "That offer isn't at this venue");
    }
    if (input.bookingDate < ms.startsOn || input.bookingDate > ms.endsOn) fail(422, "outside_pass_dates", "The booking date is outside the pass's dates");
    const staff = c.get("staff");
    await db.transaction(async (tx) => {
      const row = one(await tx.insert(bookings).values({ ...input, memberId: id, status: "confirmed" }).returning());
      await staffAudit(tx, staff, "booking.created", "booking", row.id, null, row);
    });
    return c.json({ bookings: await listFor(id) }, 201);
  });

  app.post("/bookings/:id/cancel", requirePermission("members.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const { reason } = await body(c, z.object({ reason: z.string().trim().min(3).max(500) }));
    const staff = c.get("staff");
    const memberId = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(bookings).where(eq(bookings.id, id)).for("update");
      if (!before) fail(404, "not_found", "Booking not found");
      if (before.redemptionId) fail(409, "booking_used", "This booking was already used at a scan; reverse the visit instead");
      const after = one(await tx.update(bookings).set({ status: "cancelled" }).where(eq(bookings.id, id)).returning());
      await staffAudit(tx, staff, "booking.cancelled", "booking", id, before, { ...after, reason });
      return before.memberId;
    });
    return c.json({ bookings: await listFor(memberId) });
  });

  app.post("/redemptions/:id/reverse", requirePermission("members.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const { reason } = await body(c, z.object({ reason: z.string().trim().min(3).max(500) }));
    try {
      const reversed = await reverseRedemption(db, { redemptionId: id, reason, actor: { type: "staff", id: c.get("staff").id }, now: deps.clock() });
      if (!reversed) fail(404, "not_found", "Visit not found");
      return c.json({ ok: true });
    } catch (err) {
      if (err instanceof CannotReverseError) fail(409, "cannot_reverse", err.message);
      throw err;
    }
  });

  return app;
}
