// Builds an isolated TEST world per test: its own partner, venue, offer, plan, members and
// allowances, so tests never depend on each other or on seed data.
import { randomInt, randomUUID } from "node:crypto";
import { grantAllowances, schema, type Db } from "@intu/db";
import { eq } from "drizzle-orm";
import type { WeeklyHours } from "@intu/rules";

const allDay: WeeklyHours = {
  "0": [{ open: "00:00", close: "24:00" }],
  "1": [{ open: "00:00", close: "24:00" }],
  "2": [{ open: "00:00", close: "24:00" }],
  "3": [{ open: "00:00", close: "24:00" }],
  "4": [{ open: "00:00", close: "24:00" }],
  "5": [{ open: "00:00", close: "24:00" }],
  "6": [{ open: "00:00", close: "24:00" }],
};

// Country code 999 is unassigned, so these can never be real numbers.
const fakePhone = () => `+999${randomInt(10 ** 9, 10 ** 10)}`;

export interface WorldOptions {
  /** The plan benefit's category (any level). Defaults to C03-S01 Beach Clubs. */
  benefitCode?: string;
  /** The offer's service type. Defaults to the benefit's code if that's a service type, else C03-S01-T01. */
  offerCode?: string;
  quantity?: number | null;
  sharedByGroup?: boolean;
  members?: number;
  dailyCap?: number | null;
  drawPerPerson?: boolean;
}

export async function createWorld(db: Db, opts: WorldOptions = {}) {
  const tag = randomUUID().slice(0, 8);
  const benefitCode = opts.benefitCode ?? "C03-S01";
  const offerCode = opts.offerCode ?? (benefitCode.split("-").length === 3 ? benefitCode : "C03-S01-T01");
  const categoryId = async (code: string) => {
    const [c] = await db.select({ id: schema.categories.id }).from(schema.categories).where(eq(schema.categories.code, code));
    if (!c) throw new Error(`No category ${code}`);
    return c.id;
  };
  const memberCount = opts.members ?? 1;

  const [partner] = await db.insert(schema.partners).values({ legalName: `TEST Partner ${tag}`, tradingName: `TEST ${tag}`, isTest: true }).returning();
  const [venue] = await db
    .insert(schema.venues)
    .values({ partnerId: partner!.id, name: `TEST Venue ${tag}`, area: "Oniru", city: "lagos", category: "beach_club", openingHours: allDay, isTest: true })
    .returning();
  const [offer] = await db
    .insert(schema.offers)
    .values({ venueId: venue!.id, categoryId: await categoryId(offerCode), rateMinor: 1_800_000, dailyCap: opts.dailyCap ?? null, isTest: true })
    .returning();
  const [plan] = await db
    .insert(schema.plans)
    .values({ code: `TEST-${tag}`, name: `TEST Plan ${tag}`, seasonStartsOn: "2026-12-01", seasonEndsOn: "2027-01-10", groupSize: memberCount, isTest: true })
    .returning();
  await db.insert(schema.benefits).values({
    planId: plan!.id,
    categoryId: await categoryId(benefitCode),
    quantity: opts.quantity === undefined ? 4 : opts.quantity,
    period: "per_pass",
    sharedByGroup: opts.sharedByGroup ?? false,
    drawPerPerson: opts.drawPerPerson ?? false,
  });

  const groupId = memberCount > 1 ? randomUUID() : null;
  const people = [];
  for (let i = 0; i < memberCount; i++) {
    const [member] = await db.insert(schema.members).values({ fullName: `TEST Member ${tag}-${i}`, phone: fakePhone(), isTest: true }).returning();
    const [membership] = await db
      .insert(schema.memberships)
      .values({ memberId: member!.id, planId: plan!.id, startsOn: "2026-12-01", endsOn: "2027-01-10", status: "active", groupId })
      .returning();
    await grantAllowances(db, membership!.id, { type: "system" });
    people.push({ member: member!, membership: membership! });
  }

  return { venue: venue!, offer: offer!, plan: plan!, people, first: people[0]! };
}

/** A catalogue category's id by code, e.g. "C04-S05". */
export async function categoryIdOf(db: Db, code: string) {
  const [c] = await db.select({ id: schema.categories.id }).from(schema.categories).where(eq(schema.categories.code, code));
  if (!c) throw new Error(`No category ${code}`);
  return c.id;
}
