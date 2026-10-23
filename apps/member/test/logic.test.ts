import { describe, expect, it } from "vitest";
import { allowanceLabel, discoverSections, formatMoney, needsFlight, vehicleText, venueActions, ruleLines, tripText, backupCodeFor, bookableDates, currentPass, suspendedNotice, usablePasses, formatDate, formatLagosTime, hoursToday, lagosDate, needsRenewal, passUsable, toE164, whatsappLink } from "../src/lib/logic";
import type { Hours, Membership, StoredPass } from "../src/lib/types";

const pass = (id: string, startsOn: string, endsOn: string, status: Membership["status"] = "active"): Membership => ({ id, plan: { id: "p", name: "TEST Plan" }, passNumber: null, status, startsOn, endsOn, arrivesOn: null, departsOn: null, crew: false, allowances: [] });
const stored = (expiresAt: string): StoredPass => ({ deviceId: "d", certificate: "c", expiresAt, backupCodes: [{ validOn: "2026-12-12", code: "123456" }] });

describe("Lagos dates", () => {
  it("is UTC+1 all year", () => {
    expect(lagosDate(new Date("2026-12-12T22:59:00Z"))).toBe("2026-12-12");
    expect(lagosDate(new Date("2026-12-12T23:00:00Z"))).toBe("2026-12-13");
    expect(formatLagosTime("2026-12-14T20:40:00Z")).toBe("14 Dec, 21:40");
    expect(formatDate("2026-12-14", { weekday: true, year: false })).toBe("Mon 14 Dec");
  });
});

describe("currentPass", () => {
  const now = new Date("2026-12-12T12:00:00Z");
  it("shows the active pass valid today, else the next one to start", () => {
    const later = pass("later", "2027-01-05", "2027-02-01");
    const today = pass("today", "2026-12-01", "2027-01-10");
    expect(currentPass([later, today], now)?.id).toBe("today");
    expect(currentPass([later, pass("soon", "2026-12-20", "2027-01-01")], now)?.id).toBe("soon");
  });
  it("falls back to a suspended pass so the member sees why it won't scan", () => {
    expect(currentPass([pass("s", "2026-12-01", "2027-01-10", "suspended")], now)?.id).toBe("s");
    expect(currentPass([], now)).toBeNull();
  });
});

describe("suspended passes", () => {
  it("leaves them out of the pass list and sums them up in one line", () => {
    const held = pass("s", "2026-12-01", "2027-01-10", "suspended");
    expect(usablePasses([held, pass("a", "2026-12-01", "2027-01-10")]).map((m) => m.id)).toEqual(["a"]);
    expect(suspendedNotice([held])).toBe("Your TEST Plan pass is on hold. Message the concierge for help.");
    expect(suspendedNotice([pass("a", "2026-12-01", "2027-01-10")])).toBeNull();
  });
});

describe("pass renewal", () => {
  const now = new Date("2026-12-12T12:00:00Z");
  it("renews below 30 hours left, so a renewed pass always lasts a day offline", () => {
    expect(needsRenewal(null, now)).toBe(true);
    expect(needsRenewal(stored("2026-12-13T17:59:59Z"), now)).toBe(true);
    expect(needsRenewal(stored("2026-12-13T18:00:01Z"), now)).toBe(false);
  });
  it("stops making codes once the pass expires", () => {
    expect(passUsable(stored("2026-12-12T12:00:01Z"), now)).toBe(true);
    expect(passUsable(stored("2026-12-12T11:59:59Z"), now)).toBe(false);
    expect(backupCodeFor(stored("2026-12-13T00:00:00Z"), now)).toBe("123456");
    expect(backupCodeFor(stored("2026-12-13T00:00:00Z"), new Date("2026-12-13T12:00:00Z"))).toBeNull();
  });
});

describe("labels and links", () => {
  it("says what's left", () => {
    expect(allowanceLabel({ granted: 4, remaining: 3 })).toBe("3 of 4 left");
    expect(allowanceLabel({ granted: 4, remaining: 0 })).toBe("Used up");
    expect(allowanceLabel({ granted: null, remaining: null })).toBe("Unlimited");
  });
  it("gives today's hours in Lagos", () => {
    const hours = { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [{ open: "22:00", close: "04:00" }], "6": [{ open: "00:00", close: "24:00" }] } as Hours;
    expect(hoursToday(hours, new Date("2026-12-11T12:00:00Z"))).toBe("22:00–04:00");
    expect(hoursToday(hours, new Date("2026-12-12T12:00:00Z"))).toBe("Open all day");
    expect(hoursToday(hours, new Date("2026-12-13T12:00:00Z"))).toBe("Closed today");
  });
  it("offers days from today to the end of the pass", () => {
    const m = pass("m", "2026-12-01", "2026-12-15");
    expect(bookableDates(m, new Date("2026-12-12T12:00:00Z"))).toEqual(["2026-12-12", "2026-12-13", "2026-12-14", "2026-12-15"]);
    expect(bookableDates(pass("f", "2027-01-05", "2027-03-01"), new Date("2026-12-12T12:00:00Z"), 2)).toEqual(["2027-01-05", "2027-01-06"]);
  });
  it("opens the concierge chat with who's asking", () => {
    expect(whatsappLink("+234 800 000 0001", { fullName: "TEST Ada", passNumber: "TEST-0001" })).toBe(`https://wa.me/2348000000001?text=${encodeURIComponent("Hi intu, it's TEST Ada (pass TEST-0001). ")}`);
  });
  it("reads phone numbers typed with spaces or 00", () => {
    expect(toE164("+44 7700 900123")).toBe("+447700900123");
    expect(toE164("0044 7700 900123")).toBe("+447700900123");
    expect(toE164("07700900123")).toBeNull();
  });
});

describe("discoverSections", () => {
  const venue = (name: string, sectionCode: string, sectionName: string, extra: { night?: boolean; included?: boolean; area?: string; kind?: string } = {}) => ({
    name,
    area: extra.area ?? "Ikoyi",
    night: extra.night ?? false,
    included: extra.included ?? false,
    category: { code: `${sectionCode}-S01`, name: extra.kind ?? "Beach Clubs" },
    section: { code: sectionCode, name: sectionName },
  });
  const venues = [
    venue("TEST Zebra Beach", "C03", "Beach & Water", { included: true }),
    venue("TEST Afterdark", "C06", "Nightlife & Social", { night: true, kind: "Nightclubs", area: "Lekki" }),
    venue("TEST Atlantic Shore", "C03", "Beach & Water"),
    venue("TEST Grill", "C02", "Food & Drink", { kind: "Restaurants" }),
  ];
  const all = { side: "all" as const, includedOnly: false, search: "" };

  it("groups by the top of the catalogue, in catalogue order, plan's venues first", () => {
    expect(discoverSections(venues, all).map((r) => [r.section.name, r.venues.map((v) => v.name)])).toEqual([
      ["Food & Drink", ["TEST Grill"]],
      ["Beach & Water", ["TEST Zebra Beach", "TEST Atlantic Shore"]],
      ["Nightlife & Social", ["TEST Afterdark"]],
    ]);
  });
  it("filters by day or night, what the plan includes, and search words", () => {
    expect(discoverSections(venues, { ...all, side: "night" }).map((r) => r.section.code)).toEqual(["C06"]);
    expect(discoverSections(venues, { ...all, includedOnly: true }).flatMap((r) => r.venues.map((v) => v.name))).toEqual(["TEST Zebra Beach"]);
    expect(discoverSections(venues, { ...all, search: "lekki club" }).flatMap((r) => r.venues.map((v) => v.name))).toEqual(["TEST Afterdark"]);
    expect(discoverSections(venues, { ...all, search: "restaurants" }).map((r) => r.section.code)).toEqual(["C02"]);
    expect(discoverSections(venues, { ...all, search: "nothing like this" })).toEqual([]);
  });
  it("groups venues saved before the API sent sections by their own category", () => {
    const { section: _section, ...old } = venue("TEST Old", "C04", "Wellness & Fitness", { kind: "Spa & Massage" });
    expect(discoverSections([old], all).map((r) => r.section)).toEqual([{ code: "C04", name: "Spa & Massage" }]);
  });
});

describe("benefit pages", () => {
  it("puts the rules in plain words", () => {
    expect(ruleLines({ oncePerVenuePerDay: true, oncePerVenuePerMonth: false, onePerPerson: true, sharedByCrew: true, topTierVenues: false })).toEqual(["Once per venue per day", "Each person in your party uses one", "Shared by everyone in your Crew"]);
    expect(ruleLines({ oncePerVenuePerDay: false, oncePerVenuePerMonth: false, onePerPerson: false, sharedByCrew: false, topTierVenues: true })).toEqual(["Includes top-tier venues"]);
  });
  it("asks for the flight when the offer, or every offer, is an airport service", () => {
    const offers = [{ id: "meet", usageMode: "airport" as const, booked: true }, { id: "lounge", usageMode: "door" as const, booked: false }];
    expect(needsFlight(offers, "meet")).toBe(true);
    expect(needsFlight(offers, "lounge")).toBe(false);
    // With nothing chosen, only what's booked ahead counts: the meet-and-greet.
    expect(needsFlight(offers, null)).toBe(true);
    expect(needsFlight([offers[0]!], null)).toBe(true);
    expect(needsFlight([], null)).toBe(false);
  });
  it("describes the flight", () => {
    expect(tripText({ direction: "arrival", flightNumber: "BA75", time: "15:20" })).toBe("Arriving on BA75 at 15:20");
    expect(tripText(null)).toBeNull();
  });
});

describe("venueActions", () => {
  const offer = (usageMode: "door" | "booking" | "airport" | "call" | "concierge", included = true) => ({ usageMode, booked: usageMode === "booking" || usageMode === "airport", included });
  it("shows the pass for entry, with no booking", () => {
    expect(venueActions({ kind: "place", servicePhone: null, offers: [offer("door")] })).toEqual({ showPass: true, call: null, book: null, concierge: false });
  });
  it("books only the packages, alongside entry at the door", () => {
    expect(venueActions({ kind: "place", servicePhone: null, offers: [offer("door"), offer("booking", false)] })).toMatchObject({ showPass: true, book: "Book ahead" });
  });
  it("asks for the flight when everything booked is an airport service", () => {
    expect(venueActions({ kind: "place", servicePhone: null, offers: [offer("airport")] })).toMatchObject({ showPass: false, book: "Request it with your flight" });
  });
  it("calls a service line, whether it's set up as a phone service or a place", () => {
    expect(venueActions({ kind: "remote", servicePhone: "+9990000000002", offers: [offer("call")] })).toEqual({ showPass: false, call: "+9990000000002", book: null, concierge: false });
    expect(venueActions({ kind: "place", servicePhone: "+9990000000002", offers: [offer("call")] })).toMatchObject({ call: "+9990000000002", book: null });
    expect(venueActions({ kind: "remote", servicePhone: "+9990000000002", offers: [offer("call", false)] }).call).toBeNull();
  });
});

describe("vehicleText", () => {
  it("names the car so the member can spot it", () => {
    expect(vehicleText({ plate: "LND 123 AB", makeModel: "Toyota Land Cruiser", year: 2022, colour: "Black" })).toBe("Black Toyota Land Cruiser · LND 123 AB");
    expect(vehicleText({ plate: "LND 123 AB", makeModel: "Lexus LX 600", year: null, colour: null })).toBe("Lexus LX 600 · LND 123 AB");
    expect(vehicleText(null)).toBeNull();
  });
});

describe("formatMoney", () => {
  it("shows whole amounts without pennies", () => {
    expect(formatMoney(25_000, "GBP")).toBe("£250");
    expect(formatMoney(50_000_000, "NGN")).toBe("₦500,000");
    expect(formatMoney(9_950, "USD")).toBe("$99.50");
  });
});
