// Builds an isolated TEST venue, door staff member and pass holder straight in the database, open
// all day and valid today, so the scanner tests don't depend on seed data or the time they run.
import { randomInt, randomUUID } from "node:crypto";
import { createDb, grantAllowances, hashPin, one, schema } from "@intu/db";
import { generateKeyPair, parseSecretKey, signCode, signPass, toBase64url } from "@intu/qr";
import { eq } from "drizzle-orm";
import { E2E_QR_SIGNING_KEY } from "./keys";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/intu";
const allDay = Object.fromEntries(["0", "1", "2", "3", "4", "5", "6"].map((d) => [d, [{ open: "00:00", close: "24:00" }]])) as Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", { open: string; close: string }[]>;
const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

export const { db, sql } = createDb(DATABASE_URL, { max: 2 });

const categoryId = async (code: string) => one(await db.select({ id: schema.categories.id }).from(schema.categories).where(eq(schema.categories.code, code))).id;

export async function createWorld(opts: { quantity?: number; offers?: number; visiting?: boolean } = {}) {
  const tag = randomUUID().slice(0, 6).toUpperCase();
  const partner = one(await db.insert(schema.partners).values({ legalName: `TEST E2E Partner ${tag}`, tradingName: `TEST E2E ${tag}`, isTest: true }).returning());
  const loginCode = `E${tag.slice(0, 5)}`;
  const venue = one(
    await db
      .insert(schema.venues)
      .values({ partnerId: partner.id, name: `TEST E2E ${opts.visiting ? "Chauffeurs" : "Beach"} ${tag}`, kind: opts.visiting ? "visiting" : "place", area: "Oniru", city: "lagos", categoryId: await categoryId("C03-S01"), loginCode, openingHours: allDay, isTest: true })
      .returning(),
  );
  const offerCodes = ["C03-S01-T01", "C03-S01-T02"].slice(0, opts.offers ?? 1);
  const offers: (typeof schema.offers.$inferSelect)[] = [];
  for (const code of offerCodes) offers.push(one(await db.insert(schema.offers).values({ venueId: venue.id, categoryId: await categoryId(code), rateMinor: 1_500_000, isTest: true }).returning()));
  const pin = String(randomInt(100000, 999999));
  const staff = one(await db.insert(schema.staffUsers).values({ role: "door_staff", fullName: `TEST Door ${tag}`, partnerId: partner.id, pinHash: hashPin(pin), isTest: true }).returning());
  await db.insert(schema.staffUserVenues).values({ staffUserId: staff.id, venueId: venue.id });

  const plan = one(await db.insert(schema.plans).values({ code: `TEST-E2E-${tag}`, name: `TEST E2E Plan ${tag}`, durationDays: 30, isTest: true }).returning());
  await db.insert(schema.benefits).values({ planId: plan.id, categoryId: await categoryId("C03-S01"), quantity: opts.quantity ?? 4, period: "per_pass", allowedVenueTiers: ["standard", "top"] });
  const member = one(await db.insert(schema.members).values({ fullName: `TEST Ama Scanner ${tag}`, phone: `+999${randomInt(10 ** 9, 10 ** 10)}`, isTest: true }).returning());
  const membership = one(await db.insert(schema.memberships).values({ memberId: member.id, planId: plan.id, startsOn: isoDay(-1), endsOn: isoDay(30), status: "active" }).returning());
  await grantAllowances(db, membership.id, { type: "system" });

  // The member's phone: its own key, registered, holding a pass the (e2e) server key signed.
  const device = generateKeyPair();
  const row = one(await db.insert(schema.devices).values({ memberId: member.id, publicKey: toBase64url(device.publicKey), platform: "e2e" }).returning());
  const server = parseSecretKey(E2E_QR_SIGNING_KEY);
  const cert = signPass(
    { keyId: server.keyId, membershipId: membership.id, deviceId: row.id, planId: plan.id, startsOn: membership.startsOn, endsOn: membership.endsOn, name: member.fullName, expiresAt: new Date(Date.now() + 86_400_000), devicePublicKey: device.publicKey },
    server.secretKey,
  );
  /** A confirmed booking for today (Lagos), for visiting services. */
  const book = async () =>
    one(
      await db
        .insert(schema.bookings)
        .values({ memberId: member.id, membershipId: membership.id, venueId: venue.id, offerId: offers[0]?.id ?? null, bookingDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(new Date()), status: "confirmed", notes: "TEST e2e pickup" })
        .returning(),
    );
  return { venue, offers, loginCode, pin, member, membership, book, code: (at = new Date()) => signCode(cert, device.secretKey, at) };
}
