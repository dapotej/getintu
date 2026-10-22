// Small byte helpers that work the same in Node, browsers and React Native.

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));

export function toBase64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a = 0, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | (b << 8) | c;
    out += B64.charAt((n >> 18) & 63) + B64.charAt((n >> 12) & 63);
    if (i + 1 < bytes.length) out += B64.charAt((n >> 6) & 63);
    if (i + 2 < bytes.length) out += B64.charAt(n & 63);
  }
  return out;
}

export function fromBase64url(text: string): Uint8Array {
  if (text.length % 4 === 1) throw new Error("Not base64url");
  const out = new Uint8Array(Math.floor((text.length * 3) / 4));
  let bits = 0;
  let value = 0;
  let o = 0;
  for (const ch of text) {
    const v = B64_INDEX.get(ch);
    if (v === undefined) throw new Error("Not base64url");
    value = (value << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (value >> bits) & 0xff;
    }
  }
  return out;
}

export function uuidToBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(hex)) throw new Error(`Not a UUID: ${uuid}`);
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function bytesToUuid(bytes: Uint8Array): string {
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** UTF-8 of `text`, cut to at most `max` bytes without splitting a character. */
export function utf8Truncated(text: string, max: number): Uint8Array {
  const encoder = new TextEncoder();
  let bytes = encoder.encode(text);
  let chars = [...text];
  while (bytes.length > max) {
    chars = chars.slice(0, -1);
    bytes = encoder.encode(chars.join(""));
  }
  return bytes;
}

export const concat = (...parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
