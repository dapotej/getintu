import type { Db } from "./client.ts";
import { grantAllowances } from "./ledger.ts";
import { benefits, members, memberships, offers, partners, planPrices, plans, venues } from "./schema/index.ts";
import { testBenefits, testMembers, testMemberships, testOffers, testPartners, testPlanPrices, testPlans, testVenues } from "./seed-data.ts";

/** Loads TEST data. Safe to run more than once: rows that already exist are left alone. */
export async function seed(db: Db) {
  return db.transaction(async (tx) => {
    await tx.insert(partners).values(testPartners).onConflictDoNothing();
    await tx.insert(venues).values(testVenues).onConflictDoNothing();
    await tx.insert(offers).values(testOffers).onConflictDoNothing();
    await tx.insert(plans).values(testPlans).onConflictDoNothing();
    await tx.insert(planPrices).values(testPlanPrices).onConflictDoNothing();
    await tx.insert(benefits).values(testBenefits).onConflictDoNothing();
    await tx.insert(members).values(testMembers).onConflictDoNothing();
    await tx.insert(memberships).values(testMemberships).onConflictDoNothing();
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
