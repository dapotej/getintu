// Builds an isolated TEST world in the database for each test: a pass holder with a pass valid
// today, a beach club their plan includes and a spa it doesn't, so tests never depend on seed data.
import { randomInt, randomUUID } from "node:crypto";
import { createDb, grantAllowances, one, schema } from "@intu/db";
import { eq } from "drizzle-orm";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/intu";
const allDay = Object.fromEntries(["0", "1", "2", "3", "4", "5", "6"].map((d) => [d, [{ open: "00:00", close: "24:00" }]])) as Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", { open: string; close: string }[]>;
const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

export const { db, sql } = createDb(DATABASE_URL, { max: 2 });

const categoryId = async (code: string) => one(await db.select({ id: schema.categories.id }).from(schema.categories).where(eq(schema.categories.code, code))).id;
// Country code 999 is unassigned, so these can never be real numbers.
export const fakePhone = () => `+999${randomInt(10 ** 9, 10 ** 10)}`;

export async function createWorld() {
  const tag = randomUUID().slice(0, 6).toUpperCase();
  const partner = one(await db.insert(schema.partners).values({ legalName: `TEST E2E Partner ${tag}`, tradingName: `TEST E2E ${tag}`, isTest: true }).returning());
  const beach = one(await db.insert(schema.venues).values({ partnerId: partner.id, name: `TEST E2E Beach ${tag}`, area: "Oniru", city: "lagos", categoryId: await categoryId("C03-S01"), openingHours: allDay, latitude: 6.43, longitude: 3.45, isTest: true }).returning());
  const spa = one(await db.insert(schema.venues).values({ partnerId: partner.id, name: `TEST E2E Spa ${tag}`, area: "Ikoyi", city: "lagos", categoryId: await categoryId("C04-S05"), openingHours: allDay, isTest: true }).returning());
  const beachOffer = one(await db.insert(schema.offers).values({ venueId: beach.id, categoryId: await categoryId("C03-S01-T01"), rateMinor: 1_500_000, isTest: true }).returning());
  await db.insert(schema.offers).values({ venueId: spa.id, categoryId: await categoryId("C04-S05-T01"), rateMinor: 2_500_000, isTest: true });
  const plan = one(await db.insert(schema.plans).values({ code: `TEST-E2E-${tag}`, name: `TEST E2E Pass ${tag}`, seasonStartsOn: isoDay(-2), seasonEndsOn: isoDay(30), isTest: true }).returning());
  await db.insert(schema.benefits).values({ planId: plan.id, categoryId: await categoryId("C03-S01"), quantity: 4, period: "per_pass" });
  const member = one(await db.insert(schema.members).values({ fullName: `TEST E2E Member ${tag}`, phone: fakePhone(), isTest: true }).returning());
  const membership = one(await db.insert(schema.memberships).values({ memberId: member.id, planId: plan.id, startsOn: isoDay(-2), endsOn: isoDay(30), status: "active", passNumber: `TEST-E2E-${tag}` }).returning());
  await grantAllowances(db, membership.id, { type: "system" });
  return { tag, member, membership, plan, beach, spa, beachOffer };
}
