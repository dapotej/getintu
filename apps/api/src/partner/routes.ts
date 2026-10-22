// The intu scanner's API: sign in, everything needed to scan offline, scan, sync
// offline visits, today's list and reporting a problem with a visit.
import { Hono } from "hono";
import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { audit, schema, type Db } from "@intu/db";
import { verifyPin } from "@intu/db";
import { serviceDate, shiftDate, toLagos } from "@intu/rules";
import { body, fail, query } from "../http.ts";
import { NotFoundError, redeem } from "../ledger/redeem.ts";
import { identify, publishedKeys, revocations, type PassKeys } from "../passes.ts";
import { AttemptLimiter, requireDoorStaff, signSession, SHIFT_HOURS, venueByLoginCode, type PartnerEnv } from "./session.ts";

const { benefits, bookings, categories, members, offers, plans, redemptions, staffUsers, staffUserVenues, venues } = schema;

export interface PartnerDeps {
  db: Db;
  passKeys: PassKeys;
  partnerSessionSecret: string;
  clock: () => Date;
}

const uuid = z.uuid();
const SignIn = z.object({ venueCode: z.string().trim().min(4).max(12), pin: z.string().regex(/^\d{6}$/) });
const Scan = z
  .object({
    code: z.string().min(10).max(800).optional(),
    backupCode: z.string().regex(/^\d{6}$/).optional(),
    offerId: uuid,
    partySize: z.number().int().min(1).max(20).default(1),
  })
  .refine((s) => (s.code === undefined) !== (s.backupCode === undefined), "Send a scanned code or a backup code");
const Sync = z.object({
  // The scanner's clock when it sent this batch, to correct for a device clock that's off.
  sentAt: z.iso.datetime(),
  visits: z
    .array(z.object({ id: uuid, code: z.string().min(10).max(800), offerId: uuid, partySize: z.number().int().min(1).max(20), occurredAt: z.iso.datetime() }))
    .max(200),
});
const REPORT_KINDS = { wrong_person: "Wrong person", behaviour: "Behaviour", dispute: "Dispute", other: "Other" } as const;
const Report = z.object({ kind: z.enum(Object.keys(REPORT_KINDS) as [keyof typeof REPORT_KINDS]), note: z.string().trim().min(3).max(1000) });

/** Offline syncs older than this are refused: the scanner should sync within the shift. */
const MAX_OFFLINE_AGE_MS = 7 * 24 * 3600 * 1000;

const isUniqueViolation = (err: unknown) => {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.code === "23505" || e.cause?.code === "23505";
};

export function scannerRoutes(deps: PartnerDeps) {
  const { db } = deps;
  const app = new Hono<PartnerEnv>();
  const pinAttempts = new AttemptLimiter(10, 15 * 60_000);
  const backupAttempts = new AttemptLimiter(5, 10 * 60_000);

  app.post("/partner/session", async (c) => {
    const { venueCode, pin } = await body(c, SignIn);
    const key = venueCode.toUpperCase();
    const now = deps.clock();
    if (pinAttempts.blocked(key, now.getTime())) fail(429, "too_many_attempts", "Too many wrong PINs. Wait 15 minutes, or ask your manager.");
    const venue = await venueByLoginCode(db, venueCode);
    const staff = venue
      ? await db
          .select({ id: staffUsers.id, fullName: staffUsers.fullName, pinHash: staffUsers.pinHash })
          .from(staffUsers)
          .innerJoin(staffUserVenues, and(eq(staffUserVenues.staffUserId, staffUsers.id), eq(staffUserVenues.venueId, venue.id)))
          .where(and(eq(staffUsers.active, true), isNull(staffUsers.deletedAt)))
      : [];
    const match = staff.find((s) => verifyPin(pin, s.pinHash));
    if (!venue || !match) {
      pinAttempts.fail(key, now.getTime());
      fail(401, "wrong_code_or_pin", "That sign-in code and PIN don't match");
    }
    pinAttempts.clear(key);
    await audit(db, { type: "staff", id: match.id }, { action: "partner.signed_in", entity: "venue", entityId: venue.id });
    return c.json({
      token: await signSession(deps.partnerSessionSecret, { staffId: match.id, venueId: venue.id }, now),
      expiresAt: new Date(now.getTime() + SHIFT_HOURS * 3600_000).toISOString(),
      staff: { id: match.id, fullName: match.fullName },
      venue: { id: venue.id, name: venue.name },
    });
  });

  // Signed-in partner staff only. Attached per route: these routes share the app's root with others.
  const signedIn = requireDoorStaff(deps);

  // Everything the scanner caches to work offline. Refreshed when online, and every 15 minutes.
  app.get("/partner/venue", signedIn, async (c) => {
    const { venueId, staffId, fullName } = c.get("door");
    const [venue] = await db
      .select({ id: venues.id, name: venues.name, kind: venues.kind, area: venues.area, active: venues.active, tier: venues.tier, openingHours: venues.openingHours })
      .from(venues)
      .where(eq(venues.id, venueId));
    if (!venue) fail(404, "not_found", "Venue not found");
    const venueOffers = await db
      .select({ offer: offers, code: categories.code, name: categories.name })
      .from(offers)
      .innerJoin(categories, eq(categories.id, offers.categoryId))
      .where(and(eq(offers.venueId, venueId), isNull(offers.deletedAt)))
      .orderBy(asc(categories.code));
    const planBenefits = await db
      .select({ benefit: benefits, code: categories.code, name: categories.name })
      .from(benefits)
      .innerJoin(categories, eq(categories.id, benefits.categoryId))
      .innerJoin(plans, eq(plans.id, benefits.planId))
      .where(eq(plans.active, true));
    const now = deps.clock();
    // A visiting service checks bookings offline too: confirmed, unused ones around today.
    const today = toLagos(now).date;
    const upcoming =
      venue.kind === "visiting"
        ? await db
            .select({ id: bookings.id, membershipId: bookings.membershipId, offerId: bookings.offerId, bookingDate: bookings.bookingDate })
            .from(bookings)
            .where(and(eq(bookings.venueId, venueId), eq(bookings.status, "confirmed"), isNull(bookings.redemptionId), gte(bookings.bookingDate, shiftDate(today, -1)), lte(bookings.bookingDate, shiftDate(today, 1))))
        : [];
    return c.json({
      serverTime: now.toISOString(),
      bookings: upcoming,
      staff: { id: staffId, fullName },
      venue,
      offers: venueOffers.map(({ offer, code, name }) => ({
        id: offer.id,
        name,
        categoryCode: code,
        description: offer.description,
        active: offer.active,
        validHours: offer.validHours,
        validFrom: offer.validFrom,
        validTo: offer.validTo,
        dailyCap: offer.dailyCap,
      })),
      // Plan benefits as the rules engine reads them, for offline checks.
      benefits: planBenefits.map(({ benefit: b, code, name }) => ({
        id: b.id,
        planId: b.planId,
        name,
        categoryCode: code,
        allowedVenueTiers: b.allowedVenueTiers,
        caps: { oncePerVenuePerMonth: b.capOncePerVenuePerMonth, oncePerVenuePerDay: b.capOncePerVenuePerDay },
        drawPerPerson: b.drawPerPerson,
      })),
      keys: publishedKeys(deps.passKeys),
      revocations: await revocations(db, now),
    });
  });

  app.get("/revocations", signedIn, async (c) => c.json(await revocations(db, deps.clock())));

  app.post("/scan", signedIn, async (c) => {
    const { staffId, venueId } = c.get("door");
    const input = await body(c, Scan);
    const now = deps.clock();
    const [offer] = await db
      .select({ id: offers.id, name: categories.name })
      .from(offers)
      .innerJoin(categories, eq(categories.id, offers.categoryId))
      .where(and(eq(offers.id, input.offerId), eq(offers.venueId, venueId), isNull(offers.deletedAt)));
    if (!offer) fail(404, "unknown_offer", "That offer isn't at this venue");

    if (input.backupCode && backupAttempts.blocked(staffId, now.getTime())) fail(429, "too_many_attempts", "Too many wrong backup codes. Scan the QR code instead, or wait 10 minutes.");
    const who = await identify(db, deps.passKeys, input, now);
    if (!who.ok) {
      if (input.backupCode) backupAttempts.fail(staffId, now.getTime());
      return c.json({ result: "invalid", error: who.error });
    }
    const { redemptionId, decision } = await redeem(db, {
      membershipId: who.membershipId,
      venueId,
      offerId: offer.id,
      method: input.code ? "online" : "manual",
      staffUserId: staffId,
      partySize: input.partySize,
      scanCode: who.scanCode,
      now,
    });
    return c.json({
      redemptionId,
      ...decision,
      member: { name: who.name, photoUrl: null },
      offer: { id: offer.id, name: offer.name },
      partySize: input.partySize,
    });
  });

  // Visits approved while offline. Each keeps the id the scanner gave it, so a batch sent twice
  // is recorded once. Rule breaks are flagged to ops, never reversed.
  app.post("/scan/sync", signedIn, async (c) => {
    const { staffId, venueId } = c.get("door");
    const { sentAt, visits } = await body(c, Sync);
    const now = deps.clock();
    const skew = now.getTime() - Date.parse(sentAt);
    const results = [];
    for (const v of visits) {
      const [existing] = await db.select({ id: redemptions.id, flagged: redemptions.flagged }).from(redemptions).where(eq(redemptions.id, v.id));
      if (existing) {
        results.push({ id: v.id, status: "already_synced" as const, flagged: existing.flagged });
        continue;
      }
      // The code is checked against the scanner's clock at the time; the visit is recorded in server time.
      const scannedAt = new Date(v.occurredAt);
      const occurredAt = new Date(scannedAt.getTime() + skew);
      if (occurredAt.getTime() > now.getTime() + 60_000 || now.getTime() - occurredAt.getTime() > MAX_OFFLINE_AGE_MS) {
        results.push({ id: v.id, status: "rejected" as const, error: "bad_time" });
        continue;
      }
      const who = await identify(db, deps.passKeys, { code: v.code }, scannedAt, occurredAt);
      const identity = who.ok ? who : who.error === "device_revoked" ? who.identity : null;
      if (!identity) {
        results.push({ id: v.id, status: "rejected" as const, error: who.ok ? "unknown_pass" : who.error });
        continue;
      }
      try {
        const [offer] = await db.select({ id: offers.id }).from(offers).where(and(eq(offers.id, v.offerId), eq(offers.venueId, venueId)));
        if (!offer) throw new NotFoundError("offer");
        const result = await redeem(db, {
          id: v.id,
          membershipId: identity.membershipId,
          venueId,
          offerId: v.offerId,
          method: "offline",
          staffUserId: staffId,
          partySize: v.partySize,
          scanCode: v.code,
          now: occurredAt,
          flagReason: who.ok ? null : "The member's device had been revoked",
        });
        results.push({ id: v.id, status: "recorded" as const, flagged: result.flagged });
      } catch (err) {
        if (isUniqueViolation(err)) results.push({ id: v.id, status: "already_synced" as const, flagged: false });
        else if (err instanceof NotFoundError) results.push({ id: v.id, status: "rejected" as const, error: "unknown_offer" });
        else throw err;
      }
    }
    return c.json({ results });
  });

  // Today's list: visits at this venue for a service day (tonight's visits after midnight count
  // for tonight), and the bookings expected. Partners see names only.
  app.get("/partner/visits", signedIn, async (c) => {
    const { venueId } = c.get("door");
    const [venue] = await db.select({ openingHours: venues.openingHours }).from(venues).where(eq(venues.id, venueId));
    const { date } = query(c, z.object({ date: z.iso.date().optional() }));
    const day = date ?? serviceDate(venue?.openingHours ?? { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [] }, deps.clock());
    const visits = await db
      .select({
        id: redemptions.id,
        occurredAt: redemptions.occurredAt,
        memberName: members.fullName,
        offerName: categories.name,
        result: redemptions.result,
        reason: redemptions.reason,
        partySize: redemptions.partySize,
        method: redemptions.method,
        flagged: redemptions.flagged,
      })
      .from(redemptions)
      .innerJoin(members, eq(members.id, redemptions.memberId))
      .innerJoin(categories, eq(categories.id, redemptions.categoryId))
      .where(and(eq(redemptions.venueId, venueId), eq(redemptions.serviceDate, day), isNull(redemptions.deletedAt)))
      .orderBy(desc(redemptions.occurredAt));
    const expected = await db
      .select({ id: bookings.id, memberName: members.fullName, partySize: bookings.partySize, status: bookings.status, eventName: bookings.eventName, notes: bookings.notes, offerName: categories.name, used: bookings.redemptionId })
      .from(bookings)
      .innerJoin(members, eq(members.id, bookings.memberId))
      .leftJoin(offers, eq(offers.id, bookings.offerId))
      .leftJoin(categories, eq(categories.id, offers.categoryId))
      .where(and(eq(bookings.venueId, venueId), eq(bookings.bookingDate, day)));
    return c.json({ date: day, visits, bookings: expected.filter((b) => b.status !== "cancelled" && b.status !== "declined").map(({ used, ...b }) => ({ ...b, used: used !== null })) });
  });

  app.post("/partner/visits/:id/report", signedIn, async (c) => {
    const { staffId, venueId, fullName } = c.get("door");
    const id = uuid.parse(c.req.param("id"));
    const { kind, note } = await body(c, Report);
    const updated = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(redemptions).where(and(eq(redemptions.id, id), eq(redemptions.venueId, venueId))).for("update");
      if (!before) fail(404, "not_found", "Visit not found at this venue");
      const reason = `Reported by ${fullName}: ${REPORT_KINDS[kind]}. ${note}`;
      const [after] = await tx
        .update(redemptions)
        .set({ flagged: true, flagReason: before.flagReason ? `${before.flagReason}. ${reason}` : reason, flagReviewedAt: null, flagReviewedById: null, flagReviewNote: null })
        .where(eq(redemptions.id, id))
        .returning();
      await audit(tx, { type: "staff", id: staffId }, { action: "redemption.reported", entity: "redemption", entityId: id, before, after });
      return after;
    });
    return c.json({ visit: { id, flagged: updated?.flagged ?? true } });
  });

  return app;
}
