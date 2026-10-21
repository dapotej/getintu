import { describe, expect, it } from "vitest";
import { openWindowDate, serviceDate, shiftDate, type WeeklyHours } from "../src/index.ts";

const none = { "0": [], "1": [], "2": [], "3": [], "4": [], "5": [], "6": [] };

describe("service day", () => {
  it("shifts dates across month and year ends", () => {
    expect(shiftDate("2027-01-01", -1)).toBe("2026-12-31");
    expect(shiftDate("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("treats close at 24:00 as end of day", () => {
    const hours: WeeklyHours = { ...none, "6": [{ open: "18:00", close: "24:00" }] };
    expect(openWindowDate(hours, new Date("2026-12-12T22:59:00Z"))).toBe("2026-12-12");
    expect(openWindowDate(hours, new Date("2026-12-12T23:00:00Z"))).toBeNull();
  });

  it("supports two windows in one day", () => {
    const hours: WeeklyHours = { ...none, "6": [{ open: "08:00", close: "11:00" }, { open: "16:00", close: "20:00" }] };
    expect(openWindowDate(hours, new Date("2026-12-12T09:00:00Z"))).toBe("2026-12-12");
    expect(openWindowDate(hours, new Date("2026-12-12T13:00:00Z"))).toBeNull();
    expect(openWindowDate(hours, new Date("2026-12-12T16:00:00Z"))).toBe("2026-12-12");
  });

  it("falls back to the Lagos calendar date when closed", () => {
    expect(serviceDate(none, new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
  });
});
