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

const allDay: OpeningHours = daily("00:00", "24:00");

// Partners and venues for the December Pass, one or two per benefit in docs/CONCEPT.md. Every
// business is fictional. A venue's kind is a catalogue category or subcategory, by code.
const partnerId = (n: number) => `00000000-0000-4000-8000-0000000011${String(n).padStart(2, "0")}`;
export const testPartners = [
  { id: partnerId(1), legalName: "TEST SkyPort Protocol Ltd", tradingName: "TEST SkyPort Protocol" },
  { id: partnerId(2), legalName: "TEST SkyPort Lounges Ltd", tradingName: "TEST SkyPort Lounges" },
  { id: partnerId(3), legalName: "TEST Coastal Rides Ltd", tradingName: "TEST Coastal Rides" },
  { id: partnerId(4), legalName: "TEST Atlantic Shore Leisure Ltd", tradingName: "TEST Atlantic Shore" },
  { id: partnerId(5), legalName: "TEST Marina Hotels Ltd", tradingName: "TEST Marina Hotels" },
  { id: partnerId(6), legalName: "TEST Lagoon Golf Club Ltd", tradingName: "TEST Lagoon Golf Club" },
  { id: partnerId(7), legalName: "TEST Serenity Spa Ltd", tradingName: "TEST Serenity Spa" },
  { id: partnerId(8), legalName: "TEST Ikoyi House Ltd", tradingName: "TEST Ikoyi House" },
  { id: partnerId(9), legalName: "TEST Afterdark Nightlife Ltd", tradingName: "TEST Afterdark" },
  { id: partnerId(10), legalName: "TEST Table Collective Ltd", tradingName: "TEST Table Collective" },
  // Doctor on call is a phone and video service, paid as a flat fee per member: no venue to scan.
  { id: partnerId(11), legalName: "TEST CareLine Health Ltd", tradingName: "TEST CareLine Health" },
].map((p) => ({ ...p, contactEmail: `ops+${p.id.slice(-3)}@example.com`, settlementTerms: "TEST: monthly in arrears", isTest: true }));

/** A seed venue names its catalogue category by code; seed() looks up the id. */
export type SeedVenue = Omit<typeof venues.$inferInsert, "categoryId"> & { categoryCode: string };
const venueId = (n: number) => `00000000-0000-4000-8000-0000000012${String(n).padStart(2, "0")}`;
export const testVenues: SeedVenue[] = [
  { id: venueId(1), partnerId: partnerId(1), name: "TEST SkyPort Arrivals Desk", area: "Ikeja", categoryCode: "C01-S01", loginCode: "SKYARR", tier: "standard" as const, openingHours: allDay },
  { id: venueId(2), partnerId: partnerId(2), name: "TEST SkyPort Departure Lounge", area: "Ikeja", categoryCode: "C01-S01", loginCode: "SKYLNG", tier: "standard" as const, openingHours: allDay },
  { id: venueId(3), partnerId: partnerId(3), name: "TEST Coastal Rides Airport Desk", area: "Ikeja", categoryCode: "C01-S02", loginCode: "COASTL", tier: "standard" as const, openingHours: allDay },
  { id: venueId(4), partnerId: partnerId(4), name: "TEST Atlantic Shore Oniru", area: "Oniru", categoryCode: "C03-S01", loginCode: "ATLONI", tier: "standard" as const, openingHours: daily("10:00", "19:00") },
  { id: venueId(5), partnerId: partnerId(4), name: "TEST Atlantic Shore Lekki", area: "Lekki", categoryCode: "C03-S01", loginCode: "ATLLEK", tier: "standard" as const, openingHours: daily("09:00", "18:00") },
  { id: venueId(6), partnerId: partnerId(5), name: "TEST Marina Grand Hotel", area: "Victoria Island", categoryCode: "C04-S01", loginCode: "MARGRD", tier: "standard" as const, openingHours: daily("06:00", "22:00") },
  { id: venueId(7), partnerId: partnerId(5), name: "TEST Marina Suites Ikoyi", area: "Ikoyi", categoryCode: "C04-S01", loginCode: "MARSTE", tier: "standard" as const, openingHours: daily("06:00", "21:00") },
  { id: venueId(8), partnerId: partnerId(6), name: "TEST Lagoon Golf Club", area: "Ikoyi", categoryCode: "C04-S08", loginCode: "LAGOLF", tier: "standard" as const, openingHours: daily("06:30", "18:30") },
  { id: venueId(9), partnerId: partnerId(7), name: "TEST Serenity Spa Ikoyi", area: "Ikoyi", categoryCode: "C04-S05", loginCode: "SERSPA", tier: "standard" as const, openingHours: daily("09:00", "21:00") },
  { id: venueId(10), partnerId: partnerId(8), name: "TEST Ikoyi House", area: "Ikoyi", categoryCode: "C06-S04", loginCode: "IKHOUS", tier: "top" as const, openingHours: weekendNights },
  { id: venueId(11), partnerId: partnerId(9), name: "TEST Afterdark Victoria Island", area: "Victoria Island", categoryCode: "C06-S01", loginCode: "AFTRVI", tier: "standard" as const, openingHours: weekendNights },
  { id: venueId(12), partnerId: partnerId(9), name: "TEST Afterdark Lekki", area: "Lekki", categoryCode: "C06-S01", loginCode: "AFTRLK", tier: "standard" as const, openingHours: weekendNights },
  { id: venueId(13), partnerId: partnerId(10), name: "TEST Marina Grill", area: "Victoria Island", categoryCode: "C02-S01", loginCode: "MARGRL", tier: "standard" as const, openingHours: daily("12:00", "23:00") },
  { id: venueId(14), partnerId: partnerId(10), name: "TEST Ikoyi Kitchen", area: "Ikoyi", categoryCode: "C02-S01", loginCode: "IKKTCH", tier: "standard" as const, openingHours: daily("12:00", "23:00") },
].map((v) => ({ ...v, city: "lagos" as const, isTest: true }));

// Door staff: one per venue, all with the TEST PIN 246810 (hashed with a fixed salt so the SQL
// seed matches). They sign in to the scanner with their venue's login code.
export const TEST_DOOR_PIN = "246810";
export const TEST_DOOR_PIN_HASH = "scrypt$7465737470696e73616c743030303030$862ff69b444925568d4da5f8707dac34d39145715071a6027eef74292e9ce4c9";
export const testDoorStaff = testVenues.map((v, i) => ({
  id: `00000000-0000-4000-8000-0000000013${String(i + 1).padStart(2, "0")}`,
  role: "door_staff" as const,
  fullName: `TEST Door ${v.name.replace(/^TEST /, "")}`,
  partnerId: v.partnerId,
  pinHash: TEST_DOOR_PIN_HASH,
  isTest: true,
  venueId: v.id ?? "",
}));

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
// ₦42,000 per member (about £24) for concierge, operations and payment fees, as in the concept.
const season = { seasonStartsOn: "2026-12-01", seasonEndsOn: "2027-01-10", onSaleFrom: "2026-11-15", onSaleTo: "2027-01-05", overheadPerMemberMinor: 4_200_000, isTest: true };

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
// Arrival services are always used; doctor on call is a flat fee per member (about £5).
const always = { expectedUsePct: 100 };
const doctorOnCall = (planId: string) => perPass(planId, "C08-S02", null, { costBasis: "flat_per_member", plannedCostMinor: 900_000 });

// The December Pass table in docs/CONCEPT.md. WhatsApp concierge sits in each plan's fixed costs;
// event presales have no catalogue entry yet.
export const testBenefits: SeedBenefit[] = [
  perPass(essential, "C01-S01-T01", 1, always),
  perPass(essential, "C03-S01", 2),
  perPass(essential, "C04-S01-T02", 2),
  perPass(essential, "C02-S01-T01", null),
  perPass(essential, "C06-S01-T03", null),
  doctorOnCall(essential),

  perPass(plus, "C01-S01-T01", 1, always),
  perPass(plus, "C01-S02-T01", 1, always),
  perPass(plus, "C03-S01", 4),
  perPass(plus, "C04-S01-T02", 4),
  perPass(plus, "C04-S08", 1),
  perPass(plus, "C04-S05", 1),
  perPass(plus, "C02-S01-T01", null),
  perPass(plus, "C06-S01-T03", null),
  perPass(plus, "C06-S04-T01", 1),
  perPass(plus, "C01-S01-T03", 1),
  doctorOnCall(plus),

  perPass(crew, "C01-S01-T01", 1, { ...always, sharedByGroup: true }),
  perPass(crew, "C01-S02-T01", 1, { ...always, sharedByGroup: true }),
  perPass(crew, "C03-S01", 4),
  perPass(crew, "C04-S01-T02", 4),
  perPass(crew, "C04-S08", 1),
  perPass(crew, "C04-S05", 1),
  perPass(crew, "C02-S01-T01", null),
  perPass(crew, "C06-S01-T03", null),
  perPass(crew, "C06-S04-T01", 1, { sharedByGroup: true }),
  perPass(crew, "C01-S01-T03", 1),
  doctorOnCall(crew),
];

/** A seed offer names its service type by code; seed() looks up the id. */
export type SeedOffer = Omit<typeof offers.$inferInsert, "categoryId"> & { categoryCode: string };
const offerId = (n: number) => `00000000-0000-4000-8000-0000000015${String(n).padStart(2, "0")}`;
// Costs per use in kobo, from the concept's wholesale estimates at about ₦1,770 to £1. All are
// placeholders until partners quote; retail is cost plus half. Guest list and reservations are free.
export const testOffers: SeedOffer[] = (
  [
    { venueId: venueId(1), categoryCode: "C01-S01-T01", rateMinor: 6_000_000, dailyCap: 20 },
    { venueId: venueId(1), categoryCode: "C01-S01-T02", rateMinor: 4_500_000, dailyCap: 20 },
    { venueId: venueId(2), categoryCode: "C01-S01-T03", rateMinor: 3_500_000, dailyCap: 30 },
    { venueId: venueId(3), categoryCode: "C01-S02-T01", rateMinor: 4_500_000, dailyCap: 15 },
    { venueId: venueId(3), categoryCode: "C01-S02-T02", rateMinor: 4_500_000, dailyCap: 15 },
    { venueId: venueId(4), categoryCode: "C03-S01-T01", rateMinor: 1_500_000, dailyCap: 30 },
    { venueId: venueId(5), categoryCode: "C03-S01-T02", rateMinor: 2_200_000, dailyCap: 30 },
    { venueId: venueId(6), categoryCode: "C04-S01-T02", rateMinor: 2_500_000, dailyCap: 15 },
    { venueId: venueId(7), categoryCode: "C04-S01-T02", rateMinor: 2_800_000, dailyCap: 10 },
    { venueId: venueId(8), categoryCode: "C04-S08-T01", rateMinor: 4_000_000, dailyCap: 8 },
    { venueId: venueId(9), categoryCode: "C04-S05-T01", rateMinor: 6_000_000, dailyCap: 6 },
    { venueId: venueId(9), categoryCode: "C04-S05-T02", rateMinor: 4_500_000, dailyCap: 6 },
    { venueId: venueId(10), categoryCode: "C06-S04-T01", rateMinor: 2_500_000, dailyCap: 10 },
    { venueId: venueId(11), categoryCode: "C06-S01-T03", rateMinor: 0, dailyCap: 40 },
    { venueId: venueId(12), categoryCode: "C06-S01-T03", rateMinor: 0, dailyCap: 30 },
    { venueId: venueId(13), categoryCode: "C02-S01-T01", rateMinor: 0, dailyCap: 10 },
    { venueId: venueId(14), categoryCode: "C02-S01-T01", rateMinor: 0, dailyCap: 10 },
  ] satisfies Omit<SeedOffer, "rateCurrency" | "isTest">[]
).map((o, i) => ({ id: offerId(i + 1), ...o, retailMinor: Math.round((o.rateMinor * 3) / 2), rateCurrency: "NGN" as const, pricesArePlaceholders: true, isTest: true }));

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

/** TEST planning exchange rates, in kobo per pound and per dollar. */
export const testFxRates = [
  { currency: "GBP" as const, koboPerUnit: 177_000 },
  { currency: "USD" as const, koboPerUnit: 140_000 },
];
