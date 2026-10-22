import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { one, schema, type Db } from "@intu/db";
import { requirePermission, type AdminEnv } from "../auth/staff.ts";
import { body, fail, query } from "../http.ts";
import { staffAudit } from "./audited.ts";
import { currency, idParam, isoDate, minorUnits, offerModel, partnerPriority, partnerStatus, uuid, venueTier, WeeklyHours } from "./validation.ts";

const { partners, venues, offers, categories } = schema;

const PartnerFields = z.object({
  legalName: z.string().min(2).max(200),
  tradingName: z.string().min(2).max(200),
  contactName: z.string().max(200).nullable(),
  contactEmail: z.email().nullable(),
  contactPhone: z.string().max(40).nullable(),
  settlementTerms: z.string().max(2000).nullable(),
  active: z.boolean(),
  status: partnerStatus,
  priority: partnerPriority.nullable(),
  categoryId: uuid.nullable(),
  proposedOffer: z.string().max(500).nullable(),
  offerModel: offerModel.nullable(),
  proposedCostMinor: minorUnits.nullable(),
  proposedRetailMinor: minorUnits.nullable(),
  pricesArePlaceholders: z.boolean(),
  nextAction: z.string().max(500).nullable(),
  notes: z.string().max(4000).nullable(),
});

const VenueFields = z.object({
  partnerId: uuid,
  name: z.string().min(2).max(200),
  area: z.string().min(2).max(120),
  city: z.enum(["lagos", "abuja"]),
  category: z.enum(["beach_club", "hotel", "golf", "spa", "gym", "nightclub", "members_club", "restaurant", "lounge"]),
  tier: venueTier,
  description: z.string().max(4000).nullable(),
  openingHours: WeeklyHours,
  capacityNotes: z.string().max(2000).nullable(),
  active: z.boolean(),
});

const OfferFields = z.object({
  venueId: uuid,
  categoryId: uuid,
  description: z.string().max(2000).nullable(),
  rateMinor: minorUnits,
  retailMinor: minorUnits.nullable(),
  offerModel,
  pricesArePlaceholders: z.boolean(),
  rateCurrency: currency,
  validHours: WeeklyHours.nullable(),
  validFrom: isoDate.nullable(),
  validTo: isoDate.nullable(),
  dailyCap: z.number().int().positive().nullable(),
  active: z.boolean(),
});

export function partnerRoutes(db: Db) {
  const app = new Hono<AdminEnv>();

  // Partners. Bank details are never returned; they're encrypted and set through payouts (milestone 7).
  const publicPartner = ({ bankDetailsEncrypted, ...p }: typeof partners.$inferSelect) => ({ ...p, hasBankDetails: bankDetailsEncrypted !== null });

  app.get("/partners", requirePermission("partners.read"), async (c) => {
    const rows = await db.select().from(partners).orderBy(asc(partners.tradingName));
    return c.json({ partners: rows.map(publicPartner) });
  });

  app.get("/partners/:id", requirePermission("partners.read"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const [partner] = await db.select().from(partners).where(eq(partners.id, id));
    if (!partner) fail(404, "not_found", "Partner not found");
    const partnerVenues = await db.select().from(venues).where(eq(venues.partnerId, id)).orderBy(asc(venues.name));
    return c.json({ partner: publicPartner(partner), venues: partnerVenues });
  });

  app.post("/partners", requirePermission("partners.write"), async (c) => {
    const input = await body(c, PartnerFields.partial().required({ legalName: true, tradingName: true }));
    const staff = c.get("staff");
    const row = await db.transaction(async (tx) => {
      const created = one(await tx.insert(partners).values(input).returning());
      await staffAudit(tx, staff, "partner.created", "partner", created.id, null, publicPartner(created));
      return created;
    });
    return c.json({ partner: publicPartner(row) }, 201);
  });

  app.patch("/partners/:id", requirePermission("partners.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, PartnerFields.partial());
    const staff = c.get("staff");
    const row = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(partners).where(eq(partners.id, id)).for("update");
      if (!before) fail(404, "not_found", "Partner not found");
      const after = one(await tx.update(partners).set(input).where(eq(partners.id, id)).returning());
      await staffAudit(tx, staff, "partner.updated", "partner", id, publicPartner(before), publicPartner(after));
      return after;
    });
    return c.json({ partner: publicPartner(row) });
  });

  // Venues, including their tier: which plans may use a venue is set on each plan benefit.
  app.get("/venues", requirePermission("partners.read"), async (c) => {
    const { partnerId } = query(c, z.object({ partnerId: uuid.optional() }));
    const rows = await db
      .select()
      .from(venues)
      .where(partnerId ? eq(venues.partnerId, partnerId) : undefined)
      .orderBy(asc(venues.name));
    return c.json({ venues: rows });
  });

  app.get("/venues/:id", requirePermission("partners.read"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const [venue] = await db.select().from(venues).where(eq(venues.id, id));
    if (!venue) fail(404, "not_found", "Venue not found");
    const venueOffers = await db
      .select({ offer: offers, category: { id: categories.id, code: categories.code, name: categories.name } })
      .from(offers)
      .innerJoin(categories, eq(categories.id, offers.categoryId))
      .where(eq(offers.venueId, id))
      .orderBy(asc(categories.code));
    return c.json({ venue, offers: venueOffers.map((o) => ({ ...o.offer, category: o.category })) });
  });

  app.post("/venues", requirePermission("partners.write"), async (c) => {
    const input = await body(c, VenueFields.partial().required({ partnerId: true, name: true, area: true, city: true, category: true, openingHours: true }));
    const staff = c.get("staff");
    const row = await db.transaction(async (tx) => {
      const [partner] = await tx.select({ id: partners.id }).from(partners).where(eq(partners.id, input.partnerId));
      if (!partner) fail(422, "unknown_partner", "Partner not found");
      const created = one(await tx.insert(venues).values(input).returning());
      await staffAudit(tx, staff, "venue.created", "venue", created.id, null, created);
      return created;
    });
    return c.json({ venue: row }, 201);
  });

  app.patch("/venues/:id", requirePermission("partners.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, VenueFields.omit({ partnerId: true }).partial());
    const staff = c.get("staff");
    const row = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(venues).where(eq(venues.id, id)).for("update");
      if (!before) fail(404, "not_found", "Venue not found");
      const after = one(await tx.update(venues).set(input).where(eq(venues.id, id)).returning());
      await staffAudit(tx, staff, "venue.updated", "venue", id, before, after);
      return after;
    });
    return c.json({ venue: row });
  });

  // Offers: what a venue gives for a benefit and what intu pays per use.
  app.post("/offers", requirePermission("partners.write"), async (c) => {
    const input = await body(c, OfferFields.partial().required({ venueId: true, categoryId: true, rateMinor: true }));
    if (input.validFrom && input.validTo && input.validTo < input.validFrom) fail(400, "invalid_dates", "validTo is before validFrom");
    const staff = c.get("staff");
    const row = await db.transaction(async (tx) => {
      const [venue] = await tx.select({ id: venues.id }).from(venues).where(eq(venues.id, input.venueId));
      if (!venue) fail(422, "unknown_venue", "Venue not found");
      const [category] = await tx.select().from(categories).where(eq(categories.id, input.categoryId));
      if (!category) fail(422, "unknown_category", "Category not found");
      if (category.level !== "service") fail(400, "not_a_service", "An offer delivers one service type, not a whole category");
      const created = one(await tx.insert(offers).values(input).returning());
      await staffAudit(tx, staff, "offer.created", "offer", created.id, null, created);
      return created;
    });
    return c.json({ offer: row }, 201);
  });

  app.patch("/offers/:id", requirePermission("partners.write"), async (c) => {
    const { id } = idParam.parse(c.req.param());
    const input = await body(c, OfferFields.omit({ venueId: true, categoryId: true }).partial());
    const staff = c.get("staff");
    const row = await db.transaction(async (tx) => {
      const [before] = await tx.select().from(offers).where(eq(offers.id, id)).for("update");
      if (!before) fail(404, "not_found", "Offer not found");
      const from = input.validFrom === undefined ? before.validFrom : input.validFrom;
      const to = input.validTo === undefined ? before.validTo : input.validTo;
      if (from && to && to < from) fail(400, "invalid_dates", "validTo is before validFrom");
      const after = one(await tx.update(offers).set(input).where(eq(offers.id, id)).returning());
      await staffAudit(tx, staff, "offer.updated", "offer", id, before, after);
      return after;
    });
    return c.json({ offer: row });
  });

  return app;
}
