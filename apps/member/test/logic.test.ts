import { describe, expect, it } from "vitest";
import { allowanceLabel, backupCodeFor, bookableDates, currentPass, formatDate, formatLagosTime, hoursToday, lagosDate, needsRenewal, passUsable, toE164, whatsappLink } from "../src/lib/logic";
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
