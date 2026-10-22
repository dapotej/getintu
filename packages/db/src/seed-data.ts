// TEST seed data. Every name is fictional and starts with "TEST"; phone numbers come from
// ranges reserved for fiction (UK Ofcom 07700 900xxx, US 555-01xx); emails use example.com.
import type { benefits, memberships, offers, planPrices, plans } from "./schema/index.ts";
import type { OpeningHours, venues } from "./schema/partners.ts";

const daily = (open: string, close: string): OpeningHours => ({
  "0": [{ open, close }],
  "1": [{ open, close }],
  "2": [{ open, close }],
  "3": [{ open, close }],
  "4": [{ open, close }],
  "5": [{ open, close }],
  "6": [{ open, close }],
});

const weekendNights: OpeningHours = {
  "0": [],
  "1": [],
  "2": [],
  "3": [],
  "4": [{ open: "22:00", close: "04:00" }],
  "5": [{ open: "22:00", close: "04:00" }],
  "6": [{ open: "22:00", close: "04:00" }],
};

export const testPartners = [
  { id: "00000000-0000-4000-8000-000000000101", legalName: "TEST Coastline Leisure Ltd", tradingName: "TEST Coastline" },
  { id: "00000000-0000-4000-8000-000000000102", legalName: "TEST Island Hotels Ltd", tradingName: "TEST Island Hotels" },
  { id: "00000000-0000-4000-8000-000000000103", legalName: "TEST Lagoon Golf Ltd", tradingName: "TEST Lagoon Golf" },
  { id: "00000000-0000-4000-8000-000000000104", legalName: "TEST Afterdark Ltd", tradingName: "TEST Afterdark" },
].map((p) => ({ ...p, contactEmail: `ops+${p.id.slice(-3)}@example.com`, settlementTerms: "TEST: monthly in arrears", status: "live" as const, isTest: true }));

const [coastline, island, golf, afterdark] = testPartners.map((p) => p.id) as [string, string, string, string];

export const testVenues = [
  { id: "00000000-0000-4000-8000-000000000201", partnerId: coastline, name: "TEST Oniru Beach Club", area: "Oniru", category: "beach_club" as const, tier: "standard" as const, openingHours: daily("10:00", "19:00") },
  { id: "00000000-0000-4000-8000-000000000202", partnerId: coastline, name: "TEST Lekki Sands Resort", area: "Lekki", category: "beach_club" as const, tier: "standard" as const, openingHours: daily("09:00", "18:00") },
  { id: "00000000-0000-4000-8000-000000000203", partnerId: island, name: "TEST Victoria Island Hotel Pool and Gym", area: "Victoria Island", category: "hotel" as const, tier: "standard" as const, openingHours: daily("06:00", "22:00") },
  { id: "00000000-0000-4000-8000-000000000204", partnerId: island, name: "TEST Ikoyi Spa", area: "Ikoyi", category: "spa" as const, tier: "top" as const, openingHours: daily("09:00", "21:00") },
  { id: "00000000-0000-4000-8000-000000000205", partnerId: golf, name: "TEST Lagoon Golf Course", area: "Ikoyi", category: "golf" as const, tier: "standard" as const, openingHours: daily("06:30", "18:30") },
  { id: "00000000-0000-4000-8000-000000000206", partnerId: afterdark, name: "TEST Afterdark Nightclub", area: "Victoria Island", category: "nightclub" as const, tier: "standard" as const, openingHours: weekendNights },
  { id: "00000000-0000-4000-8000-000000000207", partnerId: afterdark, name: "TEST Waterfront Members Club", area: "Ikoyi", category: "members_club" as const, tier: "top" as const, openingHours: weekendNights },
].map((v): typeof venues.$inferInsert => ({ ...v, city: "lagos", isTest: true }));

export const testMembers = [
  { id: "00000000-0000-4000-8000-000000000301", fullName: "TEST Ada London", phone: "+447700900001", country: "GB" },
  { id: "00000000-0000-4000-8000-000000000302", fullName: "TEST Tunde Manchester", phone: "+447700900002", country: "GB" },
  { id: "00000000-0000-4000-8000-000000000303", fullName: "TEST Chioma Houston", phone: "+12025550101", country: "US" },
  { id: "00000000-0000-4000-8000-000000000304", fullName: "TEST Emeka Atlanta", phone: "+12025550102", country: "US" },
  { id: "00000000-0000-4000-8000-000000000305", fullName: "TEST Ngozi Crew Lead", phone: "+447700900003", country: "GB" },
  { id: "00000000-0000-4000-8000-000000000306", fullName: "TEST Kemi Crew", phone: "+447700900004", country: "GB" },
  { id: "00000000-0000-4000-8000-000000000307", fullName: "TEST Bayo Crew", phone: "+447700900005", country: "GB" },
  { id: "00000000-0000-4000-8000-000000000308", fullName: "TEST Ife Crew", phone: "+447700900006", country: "GB" },
].map((m) => ({ ...m, email: `member+${m.id.slice(-3)}@example.com`, consentTermsAt: new Date("2026-11-01T00:00:00Z"), isTest: true }));

// December Pass tiers from the one-page concept (proposed prices). TEST copies only.
const essential = "00000000-0000-4000-8000-000000000401";
const plus = "00000000-0000-4000-8000-000000000402";
const crew = "00000000-0000-4000-8000-000000000403";
const season = { seasonStartsOn: "2026-12-01", seasonEndsOn: "2027-01-10", onSaleFrom: "2026-11-15", onSaleTo: "2027-01-05", isTest: true };

export const testPlans: (typeof plans.$inferInsert)[] = [
  { id: essential, code: "TEST-DEC26-ESSENTIAL", name: "TEST December Pass Essential", ...season },
  { id: plus, code: "TEST-DEC26-PLUS", name: "TEST December Pass Plus", ...season },
  { id: crew, code: "TEST-DEC26-CREW", name: "TEST December Pass Crew", groupSize: 4, ...season },
];

export const testPlanPrices: (typeof planPrices.$inferInsert)[] = [
  { planId: essential, currency: "GBP", amountMinor: 14_900 },
  { planId: essential, currency: "USD", amountMinor: 18_900 },
  { planId: plus, currency: "GBP", amountMinor: 29_900 },
  { planId: plus, currency: "USD", amountMinor: 37_900 },
  { planId: crew, currency: "GBP", amountMinor: 89_900 },
  { planId: crew, currency: "USD", amountMinor: 113_900 },
];

/** A seed benefit names its category by code; seed() looks up the id. */
export type SeedBenefit = Omit<typeof benefits.$inferInsert, "categoryId"> & { categoryCode: string };
const perPass = (planId: string, categoryCode: string, quantity: number | null, extra: Partial<SeedBenefit> = {}): SeedBenefit => ({
  planId,
  categoryCode,
  quantity,
  period: "per_pass",
  allowedVenueTiers: ["standard", "top"],
  ...extra,
});

export const testBenefits: SeedBenefit[] = [
  perPass(essential, "C01-S01-T01", 1),
  perPass(essential, "C03-S01", 2),
  perPass(essential, "C04-S01-T02", 2),
  perPass(essential, "C06-S01-T03", null),
  perPass(essential, "C02-S01-T01", null),
  perPass(plus, "C01-S01-T01", 1),
  perPass(plus, "C03-S01", 4),
  perPass(plus, "C04-S01-T02", 4),
  perPass(plus, "C04-S08", 1),
  perPass(plus, "C04-S05", 1),
  perPass(plus, "C06-S04-T01", 1),
  perPass(plus, "C01-S01-T03", 1),
  perPass(plus, "C06-S01-T03", null),
  perPass(plus, "C02-S01-T01", null),
  perPass(crew, "C01-S01-T01", 1, { sharedByGroup: true }),
  perPass(crew, "C03-S01", 4),
  perPass(crew, "C04-S01-T02", 4),
  perPass(crew, "C04-S08", 1),
  perPass(crew, "C04-S05", 1),
  perPass(crew, "C06-S04-T01", 1, { sharedByGroup: true }),
  perPass(crew, "C01-S01-T03", 1),
  perPass(crew, "C06-S01-T03", null),
  perPass(crew, "C02-S01-T01", null),
];

// Rates are TEST placeholders in kobo until partners quote.
const venueId = (n: number) => `00000000-0000-4000-8000-00000000020${n}`;
/** A seed offer names its service type by code; seed() looks up the id. Rates are placeholders. */
export type SeedOffer = Omit<typeof offers.$inferInsert, "categoryId"> & { categoryCode: string };
export const testOffers: SeedOffer[] = (
  [
  { id: "00000000-0000-4000-8000-000000000501", venueId: venueId(1), categoryCode: "C03-S01-T01", rateMinor: 1_800_000, dailyCap: 30 },
  { id: "00000000-0000-4000-8000-000000000502", venueId: venueId(2), categoryCode: "C03-S01-T01", rateMinor: 1_800_000, dailyCap: 30 },
  { id: "00000000-0000-4000-8000-000000000503", venueId: venueId(3), categoryCode: "C04-S01-T02", rateMinor: 2_500_000, dailyCap: 15 },
  { id: "00000000-0000-4000-8000-000000000504", venueId: venueId(4), categoryCode: "C04-S05-T01", rateMinor: 6_000_000, dailyCap: 5 },
  { id: "00000000-0000-4000-8000-000000000505", venueId: venueId(5), categoryCode: "C04-S08-T01", rateMinor: 4_000_000, dailyCap: 8 },
  { id: "00000000-0000-4000-8000-000000000506", venueId: venueId(6), categoryCode: "C06-S01-T03", rateMinor: 0, dailyCap: 40 },
  { id: "00000000-0000-4000-8000-000000000507", venueId: venueId(7), categoryCode: "C06-S04-T01", rateMinor: 2_500_000, dailyCap: 10 },
  ] satisfies Omit<SeedOffer, "rateCurrency" | "isTest">[]
).map((o) => ({ ...o, retailMinor: Math.round((o.rateMinor * 3) / 2), rateCurrency: "NGN" as const, pricesArePlaceholders: true, isTest: true }));

const crewGroup = "00000000-0000-4000-8000-000000000600";
const membershipFor = (n: number, memberId: string, planId: string, groupId: string | null = null): typeof memberships.$inferInsert => ({
  id: `00000000-0000-4000-8000-00000000070${n}`,
  memberId,
  planId,
  startsOn: "2026-12-01",
  endsOn: "2027-01-10",
  status: "active",
  groupId,
  passNumber: `TEST-000${n}`,
});

const m = testMembers.map((x) => x.id);
export const testMemberships = [
  membershipFor(1, m[0] ?? "", plus),
  membershipFor(2, m[1] ?? "", essential),
  membershipFor(3, m[2] ?? "", plus),
  membershipFor(4, m[3] ?? "", essential),
  membershipFor(5, m[4] ?? "", crew, crewGroup),
  membershipFor(6, m[5] ?? "", crew, crewGroup),
  membershipFor(7, m[6] ?? "", crew, crewGroup),
  membershipFor(8, m[7] ?? "", crew, crewGroup),
];
