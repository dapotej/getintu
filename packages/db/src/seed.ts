import type { Db } from "./client.ts";
import { grantAllowances } from "./ledger.ts";
import { inArray } from "drizzle-orm";
import { benefits, bookings, categories, fxRates, members, memberships, offers, partners, planPrices, plans, staffUsers, staffUserVenues, vehicles, venues } from "./schema/index.ts";
import { testBenefits, testBookings, testDoorStaff, testFxRates, testMembers, testMemberships, testOffers, testPartners, testPlanPrices, testPlans, testVehicles, testVenues } from "./seed-data.ts";

/** Loads TEST data. Safe to run more than once: rows that already exist are left alone. */
export async function seed(db: Db) {
  return db.transaction(async (tx) => {
    // The catalogue itself is loaded by migration 0009; seed rows refer to it by code.
    const codes = [...new Set([...testVenues, ...testOffers, ...testBenefits].map((x) => x.categoryCode))];
    const cats = await tx.select({ id: categories.id, code: categories.code }).from(categories).where(inArray(categories.code, codes));
    const categoryId = (code: string) => {
      const c = cats.find((x) => x.code === code);
      if (!c) throw new Error(`Category ${code} is missing; run the migrations first`);
      return c.id;
    };
    await tx.insert(partners).values(testPartners).onConflictDoNothing();
    await tx
      .insert(venues)
      .values(testVenues.map(({ categoryCode, ...v }) => ({ ...v, categoryId: categoryId(categoryCode) })))
      .onConflictDoNothing();
    await tx.insert(staffUsers).values(testDoorStaff.map(({ venueId: _venue, ...s }) => s)).onConflictDoNothing();
    await tx.insert(staffUserVenues).values(testDoorStaff.map((s) => ({ staffUserId: s.id, venueId: s.venueId }))).onConflictDoNothing();
    await tx.insert(vehicles).values(testVehicles).onConflictDoNothing();
    await tx
      .insert(offers)
      .values(testOffers.map(({ categoryCode, ...o }) => ({ ...o, categoryId: categoryId(categoryCode) })))
      .onConflictDoNothing();
    await tx.insert(plans).values(testPlans).onConflictDoNothing();
    await tx.insert(planPrices).values(testPlanPrices).onConflictDoNothing();
    await tx
      .insert(benefits)
      .values(testBenefits.map(({ categoryCode, ...b }) => ({ ...b, categoryId: categoryId(categoryCode) })))
      .onConflictDoNothing();
    await tx.insert(fxRates).values(testFxRates).onConflictDoNothing();
    await tx.insert(members).values(testMembers).onConflictDoNothing();
    await tx.insert(memberships).values(testMemberships).onConflictDoNothing();
    await tx.insert(bookings).values(testBookings).onConflictDoNothing();
    for (const ms of testMemberships) {
      await grantAllowances(tx, ms.id ?? "", { type: "system" });
    }
    return {
      partners: testPartners.length,
      venues: testVenues.length,
      offers: testOffers.length,
      plans: testPlans.length,
      members: testMembers.length,
      memberships: testMemberships.length,
    };
  });
}
