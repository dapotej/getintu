// The member app's API: who I am, my passes and what's left, my visits, venues, and booking
// requests. Members sign in with Supabase phone auth; the first time, their sign-in is linked to
// the member record with the same phone number (made by ops, the pilot import or checkout).
import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { and, asc, desc, eq, gte, inArray, isNull, like, or } from "drizzle-orm";
import { z } from "zod";
import { audit, one, schema, type Db } from "@intu/db";
import { benefitFor, covers, includes, isBooked, isNight, openWindowDate, toLagos, usageModeOf } from "@intu/rules";
import { InvalidTokenError, type TokenVerifier } from "../auth/tokens.ts";
import { body, fail } from "../http.ts";
import { issuePass, renewPass, type PassKeys } from "../passes.ts";
import { idParam, isoDate, uuid } from "../admin/validation.ts";
import { isJpeg, type PhotoStore } from "./photos.ts";

const { allowances, benefits, bookings, categories, members, memberships, offers, partners, plans, redemptions, staffUsers, vehicles, venues } = schema;

type Member = typeof members.$inferSelect;
export type MemberEnv = { Variables: { authUserId: string; phone: string; member: Member | null } };

export interface MemberDeps {
  db: Db;
  verify: TokenVerifier;
  passKeys: PassKeys;
  photos: PhotoStore;
  clock: () => Date;
  /** Members who sign up outside production are TEST data. */
  newMembersAreTest: boolean;
  /** WhatsApp number of the concierge, E.164. */
  conciergeWhatsApp: string | null;
}

/** Catalogue code of the doctor-on-call benefit; the number comes from the medical partner's service line. */
const DOCTOR_ON_CALL = "C08-S02";
/** Signed photo links last this long. */
const PHOTO_LINK_SECONDS = 60 * 60;
/** A photo, as base64 JPEG, may be at most this big once decoded. */
const MAX_PHOTO_BYTES = 1_500_000;

const Profile = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.email().max(200).nullable().default(null),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/, "Two capital letters, e.g. GB")
    .nullable()
    .default(null),
  consentMarketing: z.boolean().default(false),
  /** Required the first time: agreeing to the terms and privacy notice. */
  acceptTerms: z.boolean().optional(),
});

const NewBooking = z.object({
  membershipId: uuid,
  venueId: uuid,
  offerId: uuid.nullable().default(null),
  bookingDate: isoDate,
  partySize: z.number().int().min(1).max(20).default(1),
  notes: z.string().trim().max(1000).nullable().default(null),
  // Airport services: the flight to meet or see off.
  trip: z
    .object({
      direction: z.enum(["arrival", "departure"]),
      flightNumber: z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9]{2,3} ?\d{1,4}[A-Z]?$/, "A flight number, e.g. BA75"),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "The time as HH:MM"),
    })
    .nullable()
    .default(null),
});

/**
 * A Supabase phone sign-in. Sets the member when there is one, linking it by phone the first time.
 * Staff accounts (email sign-in) have no phone and are refused.
 */
function requireMember(deps: Pick<MemberDeps, "db" | "verify">) {
  return createMiddleware<MemberEnv>(async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) fail(401, "unauthenticated", "Sign in first");
    let claims;
    try {
      claims = await deps.verify(token);
    } catch (err) {
      if (err instanceof InvalidTokenError) fail(401, "invalid_token", "Your session has expired. Sign in again.");
      throw err;
    }
    if (!claims.phone) fail(403, "not_a_member", "Sign in with your phone number");
    const phone = claims.phone;

    let [member] = await deps.db.select().from(members).where(and(eq(members.authUserId, claims.sub), isNull(members.deletedAt)));
    if (!member) {
      member = await deps.db.transaction(async (tx) => {
        const [byPhone] = await tx.select().from(members).where(and(eq(members.phone, phone), isNull(members.authUserId), isNull(members.deletedAt))).for("update");
        if (!byPhone) return undefined;
        const linked = one(await tx.update(members).set({ authUserId: claims.sub }).where(eq(members.id, byPhone.id)).returning());
        await audit(tx, { type: "member", id: linked.id }, { action: "member.signed_in_first_time", entity: "member", entityId: linked.id, before: { authUserId: null }, after: { authUserId: claims.sub } });
        return linked;
      });
    }
    c.set("authUserId", claims.sub);
    c.set("phone", phone);
    c.set("member", member ?? null);
    await next();
  });
}

const needMember = (c: { get: (k: "member") => Member | null }) => {
  const member = c.get("member");
  if (!member) fail(404, "no_profile", "Finish setting up your profile first");
  return member;
};

export function memberAppRoutes(deps: MemberDeps) {
  const { db } = deps;
  const app = new Hono<MemberEnv>();
  const signedIn = requireMember(deps);
  const today = () => toLagos(deps.clock()).date;

  const photoUrl = async (m: Member) => (m.photoPath ? deps.photos.signedUrl(m.photoPath, PHOTO_LINK_SECONDS) : null);

  /** Memberships the member can use now or later: active and not yet ended. */
  const currentMemberships = (memberId: string) =>
    db
      .select({ membership: memberships, plan: { id: plans.id, name: plans.name } })
      .from(memberships)
      .innerJoin(plans, eq(plans.id, memberships.planId))
      .where(and(eq(memberships.memberId, memberId), isNull(memberships.deletedAt), gte(memberships.endsOn, today())))
      .orderBy(asc(memberships.startsOn));

  /** The benefits of the member's active passes, in the shape the rules take. */
  const activeBenefits = async (memberId: string) => {
    const active = (await currentMemberships(memberId)).filter((m) => m.membership.status === "active");
    if (!active.length) return [];
    const rows = await db
      .select({ categoryCode: categories.code, allowedVenueTiers: benefits.allowedVenueTiers })
      .from(benefits)
      .innerJoin(categories, eq(categories.id, benefits.categoryId))
      .where(inArray(benefits.planId, active.map((m) => m.membership.planId)));
    return rows;
  };

  /** How members use each catalogue entry, for usageModeOf. */
  const usageModes = async () => new Map((await db.select({ code: categories.code, mode: categories.usageMode }).from(categories)).map((c) => [c.code, c.mode]));

  /**
   * Service lines (doctor on call) under a catalogue entry that the plan's benefits include, with
   * the number to call: the partner's service line, set on its venue in the console.
   */
  const callLines = async (planBenefits: Awaited<ReturnType<typeof activeBenefits>>, underCode: string) => {
    if (!planBenefits.length) return [];
    const rows = await db
      .select({ venueId: venues.id, name: venues.name, phone: venues.servicePhone, tier: venues.tier, code: categories.code })
      .from(offers)
      .innerJoin(venues, eq(venues.id, offers.venueId))
      .innerJoin(partners, eq(partners.id, venues.partnerId))
      .innerJoin(categories, eq(categories.id, offers.categoryId))
      .where(and(eq(venues.active, true), isNull(venues.deletedAt), eq(offers.active, true), isNull(offers.deletedAt), eq(partners.active, true), or(eq(categories.code, underCode), like(categories.code, `${underCode}-%`))))
      .orderBy(asc(venues.name));
    const lines = new Map<string, { venueId: string; name: string; phone: string }>();
    for (const r of rows) if (r.phone && includes(planBenefits, r.code, r.tier) && !lines.has(r.venueId)) lines.set(r.venueId, { venueId: r.venueId, name: r.name, phone: r.phone });
    return [...lines.values()];
  };

  const profile = async (m: Member) => {
    const planBenefits = await activeBenefits(m.id);
    const [doctor] = await callLines(planBenefits, DOCTOR_ON_CALL);
    return {
      member: { id: m.id, fullName: m.fullName, phone: m.phone, email: m.email, country: m.country, consentMarketing: m.consentMarketing, hasPhoto: m.photoPath !== null, photoUrl: await photoUrl(m), isTest: m.isTest },
      concierge: deps.conciergeWhatsApp ? { whatsapp: deps.conciergeWhatsApp } : null,
      // Only for members whose plan includes doctor on call, from the medical partner's service line.
      doctorOnCall: doctor ? { name: doctor.name, phone: doctor.phone } : null,
    };
  };

  // Who I am. A phone sign-in with no member yet gets `member: null` and sets up a profile.
  app.get("/me", signedIn, async (c) => {
    const member = c.get("member");
    if (!member) return c.json({ member: null, phone: c.get("phone"), concierge: deps.conciergeWhatsApp ? { whatsapp: deps.conciergeWhatsApp } : null, doctorOnCall: null });
    return c.json(await profile(member));
  });

  // Sets up or updates my profile. Setting it up needs the terms accepted.
  app.put("/me", signedIn, async (c) => {
    const input = await body(c, Profile);
    const existing = c.get("member");
    const actorFor = (id: string) => ({ type: "member" as const, id });
    const fields = { fullName: input.fullName, email: input.email, country: input.country, consentMarketing: input.consentMarketing };
    const saved = await db.transaction(async (tx) => {
      if (existing) {
        const after = one(await tx.update(members).set(fields).where(eq(members.id, existing.id)).returning());
        await audit(tx, actorFor(existing.id), { action: "member.updated_profile", entity: "member", entityId: existing.id, before: existing, after });
        return after;
      }
      if (!input.acceptTerms) fail(422, "terms_required", "Accept the terms and privacy notice to continue");
      // The number belongs to a member already signed in elsewhere: ops sort that out.
      const [taken] = await tx.select({ id: members.id }).from(members).where(eq(members.phone, c.get("phone")));
      if (taken) fail(409, "phone_in_use", "This number is already on an intu account. Contact the concierge.");
      const created = one(await tx.insert(members).values({ ...fields, phone: c.get("phone"), authUserId: c.get("authUserId"), consentTermsAt: deps.clock(), isTest: deps.newMembersAreTest }).returning());
      await audit(tx, actorFor(created.id), { action: "member.signed_up", entity: "member", entityId: created.id, after: created });
      return created;
    });
    return c.json(await profile(saved), existing ? 200 : 201);
  });

  // My photo: a JPEG taken with the front camera. Venues see it at the door.
  app.put("/me/photo", signedIn, async (c) => {
    const member = needMember(c);
    const { jpegBase64 } = await body(c, z.object({ jpegBase64: z.string().min(100).max(Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 4) }));
    const jpeg = new Uint8Array(Buffer.from(jpegBase64, "base64"));
    if (!isJpeg(jpeg)) fail(400, "not_jpeg", "Send the photo as a JPEG");
    if (jpeg.length > MAX_PHOTO_BYTES) fail(400, "too_big", "The photo is too large");
    const path = `${member.id}/${randomUUID()}.jpg`;
    await deps.photos.put(path, jpeg);
    const after = await db.transaction(async (tx) => {
      const row = one(await tx.update(members).set({ photoPath: path }).where(eq(members.id, member.id)).returning());
      await audit(tx, { type: "member", id: member.id }, { action: "member.photo_changed", entity: "member", entityId: member.id, before: { photoPath: member.photoPath }, after: { photoPath: path } });
      return row;
    });
    return c.json({ photoUrl: await photoUrl(after) });
  });

  // My passes that haven't ended, each with what's left on it.
  app.get("/me/memberships", signedIn, async (c) => {
    const member = needMember(c);
    const ms = await currentMemberships(member.id);
    const groupIds = ms.map((m) => m.membership.groupId).filter((g): g is string => g !== null);
    const owner = ms.length ? or(inArray(allowances.membershipId, ms.map((m) => m.membership.id)), ...(groupIds.length ? [inArray(allowances.groupId, groupIds)] : [])) : undefined;
    const rows = owner
      ? await db
          .select({ allowance: allowances, name: categories.name, code: categories.code, period: benefits.period, shared: benefits.sharedByGroup })
          .from(allowances)
          .innerJoin(benefits, eq(benefits.id, allowances.benefitId))
          .innerJoin(categories, eq(categories.id, benefits.categoryId))
          .where(owner)
          .orderBy(asc(categories.code), asc(allowances.periodStart))
      : [];
    const now = today();
    const modes = await usageModes();
    return c.json({
      memberships: ms.map(({ membership: m, plan }) => ({
        id: m.id,
        plan,
        passNumber: m.passNumber,
        status: m.status,
        startsOn: m.startsOn,
        endsOn: m.endsOn,
        arrivesOn: m.arrivesOn,
        departsOn: m.departsOn,
        crew: m.groupId !== null,
        // The current period of each benefit (or the next one, before the pass starts).
        allowances: rows
          .filter((r) => r.allowance.membershipId === m.id || (m.groupId !== null && r.allowance.groupId === m.groupId))
          .filter((r, _, all) => {
            const forBenefit = all.filter((o) => o.allowance.benefitId === r.allowance.benefitId);
            const current = forBenefit.find((o) => o.allowance.periodStart <= now && o.allowance.periodEnd >= now) ?? forBenefit[0];
            return current === r;
          })
          .map((r) => allowanceView(r, modes)),
      })),
    });
  });

  /** One benefit's allowance as the app shows it. */
  const allowanceView = (r: { allowance: typeof allowances.$inferSelect; name: string; code: string; period: "per_pass" | "per_month" | "per_year"; shared: boolean }, modes: Map<string, (typeof categories.$inferSelect)["usageMode"]>) => ({
    id: r.allowance.id,
    name: r.name,
    code: r.code,
    night: isNight(r.code),
    usageMode: usageModeOf(r.code, modes),
    granted: r.allowance.granted,
    used: r.allowance.used,
    remaining: r.allowance.granted === null ? null : Math.max(0, r.allowance.granted - r.allowance.used),
    period: r.period,
    periodEnd: r.allowance.periodEnd,
    sharedByCrew: r.shared,
  });

  // One benefit's page: what it covers, what's left, its rules, how to use it, where, and its visits.
  app.get("/me/allowances/:id", signedIn, async (c) => {
    const member = needMember(c);
    const { id } = idParam.parse(c.req.param());
    const [row] = await db
      .select({ allowance: allowances, benefit: benefits, name: categories.name, code: categories.code })
      .from(allowances)
      .innerJoin(benefits, eq(benefits.id, allowances.benefitId))
      .innerJoin(categories, eq(categories.id, benefits.categoryId))
      .where(eq(allowances.id, id));
    // Theirs if it's on one of their passes, or shared by their Crew.
    const mine = (await currentMemberships(member.id)).find(({ membership: m }) => (row?.allowance.membershipId ?? null) === m.id || (m.groupId !== null && row?.allowance.groupId === m.groupId));
    if (!row || !mine) fail(404, "not_found", "Benefit not found");
    const modes = await usageModes();
    const view = allowanceView({ allowance: row.allowance, name: row.name, code: row.code, period: row.benefit.period, shared: row.benefit.sharedByGroup }, modes);

    // The service types it covers that members can see.
    const covered = (await db.select({ code: categories.code, name: categories.name }).from(categories).where(and(eq(categories.level, "service"), eq(categories.active, true), eq(categories.customerVisible, true), or(eq(categories.code, row.code), like(categories.code, `${row.code}-%`))))).sort((a, b) => a.code.localeCompare(b.code));

    // Where it works: venues with an offer this benefit pays for, by the same rules as a scan (the
    // most specific benefit of this pass's plan covering the offer is this one, and the tier is open).
    const planBenefits = await db
      .select({ id: benefits.id, categoryCode: categories.code, allowedVenueTiers: benefits.allowedVenueTiers })
      .from(benefits)
      .innerJoin(categories, eq(categories.id, benefits.categoryId))
      .where(eq(benefits.planId, mine.membership.planId));
    const offerRows = await db
      .select({ offerId: offers.id, code: categories.code, service: categories.name, venue: venues })
      .from(offers)
      .innerJoin(venues, eq(venues.id, offers.venueId))
      .innerJoin(partners, eq(partners.id, venues.partnerId))
      .innerJoin(categories, eq(categories.id, offers.categoryId))
      .where(and(eq(offers.active, true), isNull(offers.deletedAt), eq(venues.active, true), isNull(venues.deletedAt), eq(partners.active, true), or(eq(categories.code, row.code), like(categories.code, `${row.code}-%`))))
      .orderBy(asc(venues.name));
    const now = deps.clock();
    const where = new Map<string, { id: string; name: string; area: string; kind: "place" | "visiting" | "remote"; night: boolean; openNow: boolean; servicePhone: string | null; services: string[] }>();
    for (const o of offerRows) {
      const applies = benefitFor(planBenefits, o.code);
      if (applies?.id !== row.benefit.id || !covers(row.code, o.code) || !applies.allowedVenueTiers.includes(o.venue.tier)) continue;
      const v = where.get(o.venue.id) ?? { id: o.venue.id, name: o.venue.name, area: o.venue.area, kind: o.venue.kind, night: isNight(o.code), openNow: o.venue.kind === "place" && openWindowDate(o.venue.openingHours, now) !== null, servicePhone: o.venue.kind === "remote" || usageModeOf(o.code, modes) === "call" ? o.venue.servicePhone : null, services: [] };
      v.services.push(o.service);
      where.set(o.venue.id, v);
    }

    const visits = await db
      .select({ id: redemptions.id, occurredAt: redemptions.occurredAt, partySize: redemptions.partySize, venue: { id: venues.id, name: venues.name, area: venues.area }, service: categories.name })
      .from(redemptions)
      .innerJoin(venues, eq(venues.id, redemptions.venueId))
      .innerJoin(categories, eq(categories.id, redemptions.categoryId))
      .where(and(eq(redemptions.allowanceId, id), eq(redemptions.memberId, member.id), eq(redemptions.result, "approved"), isNull(redemptions.deletedAt)))
      .orderBy(desc(redemptions.occurredAt))
      .limit(50);

    return c.json({
      benefit: view,
      membership: { id: mine.membership.id, plan: mine.plan, startsOn: mine.membership.startsOn, endsOn: mine.membership.endsOn, status: mine.membership.status },
      covers: covered.map((x) => x.name),
      rules: {
        oncePerVenuePerDay: row.benefit.capOncePerVenuePerDay,
        oncePerVenuePerMonth: row.benefit.capOncePerVenuePerMonth,
        onePerPerson: row.benefit.drawPerPerson,
        sharedByCrew: row.benefit.sharedByGroup,
        topTierVenues: row.benefit.allowedVenueTiers.includes("top"),
      },
      venues: [...where.values()],
      visits,
    });
  });

  // My visits: the approved ones, newest first.
  app.get("/me/visits", signedIn, async (c) => {
    const member = needMember(c);
    const rows = await db
      .select({ id: redemptions.id, occurredAt: redemptions.occurredAt, serviceDate: redemptions.serviceDate, partySize: redemptions.partySize, venue: { id: venues.id, name: venues.name, area: venues.area }, service: categories.name })
      .from(redemptions)
      .innerJoin(venues, eq(venues.id, redemptions.venueId))
      .innerJoin(categories, eq(categories.id, redemptions.categoryId))
      .where(and(eq(redemptions.memberId, member.id), eq(redemptions.result, "approved"), isNull(redemptions.deletedAt)))
      .orderBy(desc(redemptions.occurredAt))
      .limit(100);
    return c.json({ visits: rows });
  });

  // Registers this phone's pass key and returns the signed pass for a membership.
  app.post("/me/devices", signedIn, async (c) => {
    const member = needMember(c);
    const input = await body(c, z.object({ membershipId: uuid, publicKey: z.string().regex(/^[A-Za-z0-9_-]{43}$/, "A base64url Ed25519 public key"), platform: z.enum(["ios", "android", "web"]) }));
    const [ms] = await db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.id, input.membershipId), eq(memberships.memberId, member.id), isNull(memberships.deletedAt)));
    if (!ms) fail(404, "not_found", "Pass not found");
    const pass = await issuePass(db, deps.passKeys, { membershipId: ms.id, devicePublicKey: input.publicKey, platform: input.platform, actor: { type: "member", id: member.id } }, deps.clock());
    if (!pass) fail(404, "not_found", "Pass not found");
    return c.json({ pass: { ...pass, expiresAt: pass.expiresAt.toISOString() } }, 201);
  });

  // A fresh pass for a phone already registered. The app calls it whenever it has signal.
  app.post("/me/devices/:id/pass", signedIn, async (c) => {
    const member = needMember(c);
    const { id } = idParam.parse(c.req.param());
    const { membershipId } = await body(c, z.object({ membershipId: uuid }));
    const [ms] = await db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.id, membershipId), eq(memberships.memberId, member.id), isNull(memberships.deletedAt)));
    if (!ms) fail(404, "not_found", "Pass not found");
    const pass = await renewPass(db, deps.passKeys, { membershipId: ms.id, deviceId: id }, deps.clock());
    // Revoked, or not this member's: the app registers again.
    if (!pass) fail(404, "device_not_found", "This phone needs to be set up again");
    return c.json({ pass: { ...pass, expiresAt: pass.expiresAt.toISOString() } });
  });

  /** Live venues with their offers, each marked included or not for this member. */
  const loadVenues = async (memberId: string, venueId?: string) => {
    const rows = await db
      .select({ venue: venues, category: { code: categories.code, name: categories.name } })
      .from(venues)
      .innerJoin(categories, eq(categories.id, venues.categoryId))
      .innerJoin(partners, eq(partners.id, venues.partnerId))
      .where(and(eq(venues.active, true), isNull(venues.deletedAt), eq(partners.active, true), isNull(partners.deletedAt), ...(venueId ? [eq(venues.id, venueId)] : [])))
      .orderBy(asc(venues.name));
    if (!rows.length) return [];
    const offerRows = await db
      .select({ id: offers.id, venueId: offers.venueId, name: categories.name, code: categories.code, description: offers.description, offerModel: offers.offerModel })
      .from(offers)
      .innerJoin(categories, eq(categories.id, offers.categoryId))
      .where(and(inArray(offers.venueId, rows.map((r) => r.venue.id)), eq(offers.active, true), isNull(offers.deletedAt)))
      .orderBy(asc(categories.code));
    const planBenefits = await activeBenefits(memberId);
    // The top of the catalogue (Beach & Water, Nightlife & Social…), which Discover groups by.
    const sections = new Map((await db.select({ code: categories.code, name: categories.name }).from(categories).where(eq(categories.level, "category"))).map((c) => [c.code, c]));
    const modes = await usageModes();
    const now = deps.clock();
    return rows.map(({ venue: v, category }) => {
      const venueOffers = offerRows
        .filter((o) => o.venueId === v.id)
        .map((o) => {
          const usageMode = usageModeOf(o.code, modes);
          return { id: o.id, name: o.name, code: o.code, description: o.description, usageMode, booked: v.kind !== "remote" && isBooked(usageMode), included: includes(planBenefits, o.code, v.tier) };
        });
      return {
        id: v.id,
        name: v.name,
        area: v.area,
        city: v.city,
        kind: v.kind,
        category,
        section: sections.get(category.code.split("-")[0] ?? "") ?? category,
        night: isNight(category.code),
        description: v.description,
        latitude: v.latitude,
        longitude: v.longitude,
        // The line to call, for a service by phone or one members use by calling.
        servicePhone: v.kind === "remote" || venueOffers.some((o) => o.usageMode === "call") ? v.servicePhone : null,
        openingHours: v.openingHours,
        openNow: v.kind === "place" && openWindowDate(v.openingHours, now) !== null,
        included: venueOffers.some((o) => o.included),
        offers: venueOffers,
      };
    });
  };

  app.get("/venues", signedIn, async (c) => {
    const member = needMember(c);
    return c.json({ venues: await loadVenues(member.id) });
  });

  app.get("/venues/:id", signedIn, async (c) => {
    const member = needMember(c);
    const { id } = idParam.parse(c.req.param());
    const [venue] = await loadVenues(member.id, id);
    if (!venue) fail(404, "not_found", "Venue not found");
    return c.json({ venue });
  });

  // The car and driver show once the concierge has confirmed the booking.
  const myBookings = async (memberId: string) =>
    (
      await db
        .select({
          id: bookings.id,
          membershipId: bookings.membershipId,
          bookingDate: bookings.bookingDate,
          partySize: bookings.partySize,
          status: bookings.status,
          notes: bookings.notes,
          trip: bookings.trip,
          createdAt: bookings.createdAt,
          venue: { id: venues.id, name: venues.name, area: venues.area, kind: venues.kind },
          offerName: categories.name,
          vehicle: { plate: vehicles.plate, makeModel: vehicles.makeModel, year: vehicles.year, colour: vehicles.colour },
          driver: { name: staffUsers.fullName },
        })
        .from(bookings)
        .leftJoin(venues, eq(venues.id, bookings.venueId))
        .leftJoin(offers, eq(offers.id, bookings.offerId))
        .leftJoin(categories, eq(categories.id, offers.categoryId))
        .leftJoin(vehicles, eq(vehicles.id, bookings.vehicleId))
        .leftJoin(staffUsers, eq(staffUsers.id, bookings.driverId))
        .where(eq(bookings.memberId, memberId))
        .orderBy(desc(bookings.bookingDate), desc(bookings.createdAt))
    ).map((b) => (b.status === "confirmed" ? b : { ...b, vehicle: null, driver: null }));

  app.get("/bookings", signedIn, async (c) => {
    const member = needMember(c);
    return c.json({ bookings: await myBookings(member.id) });
  });

  // A booking request: the concierge confirms it with the venue, then it shows as confirmed.
  app.post("/bookings", signedIn, async (c) => {
    const member = needMember(c);
    const input = await body(c, NewBooking);
    const [ms] = await db.select().from(memberships).where(and(eq(memberships.id, input.membershipId), eq(memberships.memberId, member.id), isNull(memberships.deletedAt)));
    if (!ms) fail(422, "unknown_membership", "Choose one of your passes");
    if (ms.status !== "active") fail(422, "membership_inactive", "This pass isn't active");
    if (input.bookingDate < today()) fail(422, "date_past", "Choose today or a later date");
    if (input.bookingDate < ms.startsOn || input.bookingDate > ms.endsOn) fail(422, "outside_pass_dates", "Choose a date while your pass is valid");
    const [venue] = (await loadVenues(member.id, input.venueId)) as (Awaited<ReturnType<typeof loadVenues>>[number] | undefined)[];
    if (!venue) fail(422, "unknown_venue", "Venue not found");
    if (venue.kind === "remote") fail(422, "call_instead", "Call this service instead: it's by phone or video");
    if (input.offerId && !venue.offers.some((o) => o.id === input.offerId)) fail(422, "unknown_offer", "That isn't one of this venue's offers");
    // Only packages, visiting services and airport services are booked. Entry is a scan at the
    // door, and a service line is called.
    const named = input.offerId ? venue.offers.filter((o) => o.id === input.offerId) : venue.offers;
    const asked = named.filter((o) => isBooked(o.usageMode));
    if (!asked.length) {
      if (named.some((o) => o.usageMode === "call")) fail(422, "call_instead", "Call this service instead: it's by phone or video");
      if (named.some((o) => o.usageMode === "concierge")) fail(422, "ask_concierge", "Message the concierge for this");
      fail(422, "no_booking_needed", "No booking needed: show your pass at the door");
    }
    // An airport service needs the flight: the offer asked for, or the venue's only kind of booked offer.
    if (asked.length > 0 && asked.every((o) => o.usageMode === "airport") && !input.trip) fail(422, "flight_needed", "Add your flight number and time");
    const created = await db.transaction(async (tx) => {
      const row = one(await tx.insert(bookings).values({ memberId: member.id, membershipId: ms.id, venueId: venue.id, offerId: input.offerId, bookingDate: input.bookingDate, partySize: input.partySize, notes: input.notes, trip: input.trip, status: "requested" }).returning());
      await audit(tx, { type: "member", id: member.id }, { action: "booking.requested", entity: "booking", entityId: row.id, after: row });
      return row;
    });
    const [booking] = (await myBookings(member.id)).filter((b) => b.id === created.id);
    return c.json({ booking }, 201);
  });

  return app;
}
