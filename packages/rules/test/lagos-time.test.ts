import { describe, expect, it } from "vitest";
import { toLagos } from "../src/index.ts";

describe("toLagos", () => {
  it("shifts UTC to Lagos (UTC+1)", () => {
    expect(toLagos(new Date("2026-12-01T10:30:00Z"))).toEqual({ date: "2026-12-01", month: "2026-12", weekday: 2, minutes: 11 * 60 + 30 });
  });

  it("rolls the date over when UTC is late evening", () => {
    const t = toLagos(new Date("2026-12-31T23:30:00Z"));
    expect(t.date).toBe("2027-01-01");
    expect(t.month).toBe("2027-01");
    expect(t.minutes).toBe(30);
  });
});
