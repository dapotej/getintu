import type { Db } from "./client.ts";
import { members, partners, venues } from "./schema/index.ts";
import { testMembers, testPartners, testVenues } from "./seed-data.ts";

/** Loads TEST data. Safe to run more than once: rows with existing ids are left alone. */
export async function seed(db: Db) {
  await db.insert(partners).values(testPartners).onConflictDoNothing();
  await db.insert(venues).values(testVenues).onConflictDoNothing();
  await db.insert(members).values(testMembers).onConflictDoNothing();
  return { partners: testPartners.length, venues: testVenues.length, members: testMembers.length };
}
