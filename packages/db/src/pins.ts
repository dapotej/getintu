// Door staff PINs, hashed with scrypt and a per-PIN salt: "scrypt$<salt hex>$<hash hex>".
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 32;

export function hashPin(pin: string, salt: Buffer = randomBytes(16)): string {
  return `scrypt$${salt.toString("hex")}$${scryptSync(pin, salt, KEY_LENGTH).toString("hex")}`;
}

export function verifyPin(pin: string, stored: string | null): boolean {
  const [scheme, salt, hash] = (stored ?? "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "hex");
  const actual = scryptSync(pin, Buffer.from(salt, "hex"), KEY_LENGTH);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
