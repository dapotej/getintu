import { describe, expect, it } from "vitest";
import { parseCsv, readTable } from "../src/import/csv.ts";
import { parseDate, parseLagosTimestamp } from "../src/import/dates.ts";
import { benefitFromSheet, groupUuid, nairaToKobo, normalisePhone } from "../src/import/pilot.ts";

describe("parseCsv", () => {
  it("handles quotes, escaped quotes, commas and newlines inside fields, CRLF and a BOM", () => {
    const text = '﻿name,note\r\n"Ade, Jr.","said ""hi""\nthen left"\r\nBola,\n';
    expect(parseCsv(text)).toEqual([
      ["name", "note"],
      ["Ade, Jr.", 'said "hi"\nthen left'],
      ["Bola", ""],
    ]);
  });

  it("skips blank lines", () => {
    expect(parseCsv("a\n\n\nb\n")).toEqual([["a"], ["b"]]);
  });
});

describe("readTable", () => {
  it("matches headers whatever their case and punctuation, and reports missing and unused columns", () => {
    const t = readTable("PASS NUMBER,Pass_Tier,Favourite colour\nINTU-0001,Plus,blue\n", { passNumber: ["pass number"], tier: ["pass tier"], status: [] }, ["passNumber", "status"]);
    expect(t.records[0]?.get("passNumber")).toBe("INTU-0001");
    expect(t.records[0]?.get("tier")).toBe("Plus");
    expect(t.records[0]?.line).toBe(2);
    expect(t.missing).toEqual(["status"]);
    expect(t.ignored).toEqual(["Favourite colour"]);
  });
});

describe("dates", () => {
  it("reads ISO, day-first and month-first dates, and rejects impossible ones", () => {
    expect(parseDate("2026-12-05", "DMY")).toBe("2026-12-05");
    expect(parseDate("05/12/2026", "DMY")).toBe("2026-12-05");
    expect(parseDate("12/05/2026", "MDY")).toBe("2026-12-05");
    expect(parseDate("31/02/2026", "DMY")).toBeNull();
    expect(parseDate("05/12/2026", "ISO")).toBeNull();
  });

  it("reads sheet timestamps as Lagos time unless they carry an offset", () => {
    expect(parseLagosTimestamp("05/12/2026 14:30:00", "DMY")?.toISOString()).toBe("2026-12-05T13:30:00.000Z");
    expect(parseLagosTimestamp("2026-12-05 00:15", "ISO")?.toISOString()).toBe("2026-12-04T23:15:00.000Z");
    expect(parseLagosTimestamp("2026-12-05T14:30:00Z", "ISO")?.toISOString()).toBe("2026-12-05T14:30:00.000Z");
    expect(parseLagosTimestamp("yesterday", "ISO")).toBeNull();
  });
});

describe("pilot values", () => {
  it("turns naira amounts into kobo without floats", () => {
    expect(nairaToKobo("₦18,000")).toBe(1_800_000);
    expect(nairaToKobo("25000")).toBe(2_500_000);
    expect(nairaToKobo("1,234.5")).toBe(123_450);
    expect(nairaToKobo("NGN 60,000.05")).toBe(6_000_005);
    expect(nairaToKobo("about 20k")).toBeNull();
  });

  it("normalises WhatsApp numbers and refuses ones without a country code", () => {
    expect(normalisePhone("+44 7700 900123")).toBe("+447700900123");
    expect(normalisePhone("001 (202) 555-0101")).toBe("+12025550101");
    expect(normalisePhone("07700900123")).toBeNull();
  });

  it("maps the sheet's benefit names", () => {
    expect(benefitFromSheet("Pool and gym")).toBe("pool_gym");
    expect(benefitFromSheet("Pool & Gym")).toBe("pool_gym");
    expect(benefitFromSheet("Hosted night")).toBe("hosted_night");
    expect(benefitFromSheet("Beach")).toBe("beach_club");
    expect(benefitFromSheet("Karaoke")).toBeNull();
  });

  it("gives each Crew the same group id on every run", () => {
    expect(groupUuid("CREW-7")).toBe(groupUuid(" crew-7 "));
    expect(groupUuid("CREW-7")).not.toBe(groupUuid("CREW-8"));
    expect(groupUuid("CREW-7")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
