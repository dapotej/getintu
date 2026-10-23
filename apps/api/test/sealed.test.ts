import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sealerFrom } from "../src/settlements/sealed.ts";

describe("bank details encryption", () => {
  const sealer = sealerFrom(randomBytes(32).toString("base64"));
  it("seals differently each time and opens back to the same details", () => {
    const a = sealer.seal('{"accountNumber":"0123456789"}');
    expect(a).not.toContain("0123456789");
    expect(a).not.toBe(sealer.seal('{"accountNumber":"0123456789"}'));
    expect(sealer.open(a)).toBe('{"accountNumber":"0123456789"}');
  });
  it("refuses tampered details, another key, and a key of the wrong length", () => {
    const sealed = sealer.seal("TEST");
    const parts = sealed.split(":");
    expect(() => sealer.open([...parts.slice(0, 3), Buffer.from("XXXX").toString("base64url")].join(":"))).toThrow();
    expect(() => sealerFrom(randomBytes(32).toString("base64")).open(sealed)).toThrow();
    expect(() => sealerFrom(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
  });
});
