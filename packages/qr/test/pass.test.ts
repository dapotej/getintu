import { describe, expect, it } from "vitest";
import { CODE_WINDOW_SECONDS, fromBase64url, generateKeyPair, parseSecretKey, secondsUntilNextCode, signCode, signPass, toBase64url, verifyCode, type PassFields } from "../src/index.ts";

const server = generateKeyPair();
const device = generateKeyPair();
const keys = new Map([[1, server.publicKey]]);
const now = new Date("2026-12-12T21:00:10Z");
const fields: PassFields = {
  keyId: 1,
  membershipId: "00000000-0000-4000-8000-000000000701",
  deviceId: "6f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b",
  planId: "00000000-0000-4000-8000-000000000402",
  startsOn: "2026-12-01",
  endsOn: "2027-01-10",
  name: "TEST Adaọbi Lọndọn",
  expiresAt: new Date("2026-12-13T09:00:00Z"),
  devicePublicKey: device.publicKey,
};
const cert = signPass(fields, server.secretKey);
const at = (seconds: number) => new Date(now.getTime() + seconds * 1000);

describe("pass codes", () => {
  it("round-trips: the scanner reads back exactly what the server signed", () => {
    const result = verifyCode(signCode(cert, device.secretKey, now), { publicKeys: keys, now });
    expect(result).toEqual({ ok: true, pass: fields, window: Math.floor(now.getTime() / 1000 / CODE_WINDOW_SECONDS), issuedAt: new Date("2026-12-12T21:00:00Z") });
  });

  it("is small enough for a quick scan", () => {
    expect(signCode(cert, device.secretKey, now).length).toBeLessThan(360);
  });

  it("changes every 30 seconds and lasts at most 90 (a screenshot stops working)", () => {
    expect(signCode(cert, device.secretKey, now)).not.toBe(signCode(cert, device.secretKey, at(30)));
    const code = signCode(cert, device.secretKey, now);
    expect(verifyCode(code, { publicKeys: keys, now: at(45) }).ok).toBe(true);
    expect(verifyCode(code, { publicKeys: keys, now: at(-25) }).ok).toBe(true);
    expect(verifyCode(code, { publicKeys: keys, now: at(51) })).toEqual({ ok: false, error: "code_expired" });
    expect(verifyCode(code, { publicKeys: keys, now: at(-41) })).toEqual({ ok: false, error: "code_expired" });
    expect(secondsUntilNextCode(now)).toBe(20);
  });

  it("refuses a pass signed by a key the scanner doesn't trust", () => {
    const other = generateKeyPair();
    expect(verifyCode(signCode(cert, device.secretKey, now), { publicKeys: new Map([[1, other.publicKey]]), now })).toEqual({ ok: false, error: "bad_pass_signature" });
    expect(verifyCode(signCode(cert, device.secretKey, now), { publicKeys: new Map([[2, server.publicKey]]), now })).toEqual({ ok: false, error: "unknown_key" });
  });

  it("refuses a code signed by any device but the one on the pass", () => {
    const thief = generateKeyPair();
    expect(verifyCode(signCode(cert, thief.secretKey, now), { publicKeys: keys, now })).toEqual({ ok: false, error: "bad_code_signature" });
  });

  it("refuses an expired pass certificate", () => {
    expect(verifyCode(signCode(cert, device.secretKey, new Date("2026-12-13T09:00:05Z")), { publicKeys: keys, now: new Date("2026-12-13T09:00:05Z") })).toEqual({ ok: false, error: "pass_expired" });
  });

  it("refuses edits: change one byte of the pass and both signatures fail", () => {
    const raw = fromBase64url(signCode(cert, device.secretKey, now).slice(3));
    raw[40] = raw[40]! ^ 1; // the plan id
    expect(verifyCode(`I1.${toBase64url(raw)}`, { publicKeys: keys, now })).toEqual({ ok: false, error: "bad_pass_signature" });
  });

  it("calls anything else malformed", () => {
    for (const junk of ["", "hello", "I1.", "I1.!!!!", `I1.${toBase64url(new Uint8Array(200))}`, "https://example.com"]) {
      expect(verifyCode(junk, { publicKeys: keys, now })).toEqual({ ok: false, error: "malformed" });
    }
  });

  it("cuts long names on a character boundary", () => {
    const long = signPass({ ...fields, name: "TEST " + "Ọ".repeat(40) }, server.secretKey);
    const result = verifyCode(signCode(long, device.secretKey, now), { publicKeys: keys, now });
    expect(result.ok && new TextEncoder().encode(result.pass.name).length).toBeLessThanOrEqual(48);
    expect(result.ok && result.pass.name.endsWith("Ọ")).toBe(true);
  });

  it("reads server keys from configuration", () => {
    const parsed = parseSecretKey(`7:${toBase64url(server.secretKey)}`);
    expect(parsed.keyId).toBe(7);
    expect(parsed.publicKey).toEqual(server.publicKey);
    expect(() => parseSecretKey("x:abc")).toThrow();
  });
});
