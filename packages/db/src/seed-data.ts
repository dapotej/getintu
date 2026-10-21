// TEST seed data. Every name is fictional and starts with "TEST"; phone numbers come from
// ranges reserved for fiction (UK Ofcom 07700 900xxx, US 555-01xx); emails use example.com.
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
].map((p) => ({ ...p, contactEmail: `ops+${p.id.slice(-3)}@example.com`, settlementTerms: "TEST: monthly in arrears", isTest: true }));

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
].map((m) => ({ ...m, email: `member+${m.id.slice(-3)}@example.com`, consentTermsAt: new Date("2026-11-01T00:00:00Z"), isTest: true }));
