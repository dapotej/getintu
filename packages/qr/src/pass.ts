// The member's pass, as a QR code that changes every 30 seconds.
//
// Two signatures make it work with or without signal:
// - The server signs a pass certificate: which membership and plan, its dates, the member's
//   name, and the public key of the one device allowed to show it. It lasts about a day, so the
//   app can show the pass with no signal (the spec's 24 hours).
// - The member's device signs the certificate plus the current 30-second window with its own
//   key. A screenshot stops working within a minute.
// A scanner needs only the server's public key and a revocation list to check both offline.
import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToUuid, concat, fromBase64url, toBase64url, utf8Truncated, uuidToBytes } from "./bytes.ts";

export const CODE_WINDOW_SECONDS = 30;
/** A code is accepted in its own window and one either side, covering clock drift: at most 90 seconds. */
export const CODE_WINDOW_TOLERANCE = 1;
/** How long a pass certificate lasts from issue. */
export const PASS_LIFETIME_SECONDS = 36 * 60 * 60;

const VERSION = 1;
const PREFIX = "I1.";
const NAME_MAX_BYTES = 48;
const SIG = 64;
const KEY = 32;

export interface PassFields {
  /** Which server key signed it, so keys can be rotated. 0–255. */
  keyId: number;
  membershipId: string;
  deviceId: string;
  planId: string;
  /** Lagos dates, inclusive, YYYY-MM-DD. */
  startsOn: string;
  endsOn: string;
  /** The member's name as staff should see it. Cut to 48 bytes. */
  name: string;
  expiresAt: Date;
  /** The device's Ed25519 public key. */
  devicePublicKey: Uint8Array;
}

export interface KeyPair {
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

export function generateKeyPair(): KeyPair {
  const secretKey = ed25519.utils.randomSecretKey();
  return { secretKey, publicKey: ed25519.getPublicKey(secretKey) };
}

export const publicKeyFor = (secretKey: Uint8Array): Uint8Array => ed25519.getPublicKey(secretKey);

const DAY_MS = 86_400_000;
const dateToDays = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
const daysToDate = (days: number) => new Date(days * DAY_MS).toISOString().slice(0, 10);

/** The server signs a pass certificate for one device. */
export function signPass(fields: PassFields, serverSecretKey: Uint8Array): Uint8Array {
  if (!Number.isInteger(fields.keyId) || fields.keyId < 0 || fields.keyId > 255) throw new RangeError("keyId must be 0–255");
  if (fields.devicePublicKey.length !== KEY) throw new RangeError("Device public key must be 32 bytes");
  const name = utf8Truncated(fields.name, NAME_MAX_BYTES);
  const head = new Uint8Array(2 + 16 * 3 + 2 + 2 + 4);
  const view = new DataView(head.buffer);
  head[0] = VERSION;
  head[1] = fields.keyId;
  head.set(uuidToBytes(fields.membershipId), 2);
  head.set(uuidToBytes(fields.deviceId), 18);
  head.set(uuidToBytes(fields.planId), 34);
  view.setUint16(50, dateToDays(fields.startsOn));
  view.setUint16(52, dateToDays(fields.endsOn));
  view.setUint32(54, Math.floor(fields.expiresAt.getTime() / 1000));
  const body = concat(head, fields.devicePublicKey, Uint8Array.of(name.length), name);
  return concat(body, ed25519.sign(body, serverSecretKey));
}

/** Reads a certificate without checking it. */
function readPass(cert: Uint8Array): { fields: PassFields; body: Uint8Array; signature: Uint8Array } {
  const fixed = 2 + 16 * 3 + 2 + 2 + 4 + KEY;
  if (cert.length < fixed + 1 + SIG || cert[0] !== VERSION) throw new Error("malformed");
  const nameLength = cert[fixed] ?? 0;
  const end = fixed + 1 + nameLength;
  if (cert.length !== end + SIG) throw new Error("malformed");
  const view = new DataView(cert.buffer, cert.byteOffset, cert.byteLength);
  const fields: PassFields = {
    keyId: cert[1] ?? 0,
    membershipId: bytesToUuid(cert.slice(2, 18)),
    deviceId: bytesToUuid(cert.slice(18, 34)),
    planId: bytesToUuid(cert.slice(34, 50)),
    startsOn: daysToDate(view.getUint16(50)),
    endsOn: daysToDate(view.getUint16(52)),
    expiresAt: new Date(view.getUint32(54) * 1000),
    devicePublicKey: cert.slice(58, 58 + KEY),
    name: new TextDecoder().decode(cert.slice(fixed + 1, end)),
  };
  return { fields, body: cert.slice(0, end), signature: cert.slice(end) };
}

export const windowAt = (now: Date) => Math.floor(now.getTime() / 1000 / CODE_WINDOW_SECONDS);

const windowBytes = (window: number) => {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, window);
  return b;
};

/** The member's device turns its certificate into the code for this 30-second window. */
export function signCode(cert: Uint8Array, deviceSecretKey: Uint8Array, now: Date = new Date()): string {
  const window = windowBytes(windowAt(now));
  const signature = ed25519.sign(concat(cert, window), deviceSecretKey);
  return PREFIX + toBase64url(concat(cert, window, signature));
}

/** Seconds until the code shown now changes. */
export const secondsUntilNextCode = (now: Date = new Date()) => CODE_WINDOW_SECONDS - (Math.floor(now.getTime() / 1000) % CODE_WINDOW_SECONDS);

export type CodeError =
  | "malformed"
  | "unknown_key"
  | "bad_pass_signature"
  | "pass_expired"
  | "bad_code_signature"
  | "code_expired";

export type VerifiedCode =
  | { ok: true; pass: PassFields; window: number; issuedAt: Date }
  | { ok: false; error: CodeError };

/**
 * Checks a scanned code against the server's public keys (by key id) and the time. Revocation is
 * the caller's job: look up `pass.deviceId` and `pass.membershipId`.
 */
export function verifyCode(code: string, opts: { publicKeys: ReadonlyMap<number, Uint8Array>; now?: Date }): VerifiedCode {
  const now = opts.now ?? new Date();
  let raw: Uint8Array;
  let parsed: ReturnType<typeof readPass>;
  try {
    if (!code.startsWith(PREFIX)) return { ok: false, error: "malformed" };
    raw = fromBase64url(code.slice(PREFIX.length));
    if (raw.length < 4 + SIG) return { ok: false, error: "malformed" };
    parsed = readPass(raw.slice(0, raw.length - 4 - SIG));
  } catch {
    return { ok: false, error: "malformed" };
  }
  const cert = raw.slice(0, raw.length - 4 - SIG);
  const windowRaw = raw.slice(raw.length - 4 - SIG, raw.length - SIG);
  const codeSignature = raw.slice(raw.length - SIG);

  const serverKey = opts.publicKeys.get(parsed.fields.keyId);
  if (!serverKey) return { ok: false, error: "unknown_key" };
  if (!ed25519.verify(parsed.signature, parsed.body, serverKey)) return { ok: false, error: "bad_pass_signature" };
  if (parsed.fields.expiresAt.getTime() <= now.getTime()) return { ok: false, error: "pass_expired" };
  if (!ed25519.verify(codeSignature, concat(cert, windowRaw), parsed.fields.devicePublicKey)) return { ok: false, error: "bad_code_signature" };
  const window = new DataView(windowRaw.buffer, windowRaw.byteOffset, 4).getUint32(0);
  if (Math.abs(window - windowAt(now)) > CODE_WINDOW_TOLERANCE) return { ok: false, error: "code_expired" };
  return { ok: true, pass: parsed.fields, window, issuedAt: new Date(window * CODE_WINDOW_SECONDS * 1000) };
}

/** Server keys as configured: "<keyId>:<base64url secret key>". */
export function parseSecretKey(value: string): { keyId: number; secretKey: Uint8Array; publicKey: Uint8Array } {
  const [id, key] = value.split(":");
  const keyId = Number(id);
  if (!Number.isInteger(keyId) || keyId < 0 || keyId > 255 || !key) throw new Error("Expected <keyId 0-255>:<base64url secret key>");
  const secretKey = fromBase64url(key);
  if (secretKey.length !== 32) throw new Error("A secret key is 32 bytes");
  return { keyId, secretKey, publicKey: publicKeyFor(secretKey) };
}
