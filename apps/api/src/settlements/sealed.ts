// Field-level encryption for partners' bank details: AES-256-GCM with BANK_DETAILS_KEY (32 random
// bytes, base64). The key lives only in the API's environment, never in the database.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface Sealer {
  seal(plain: string): string;
  open(sealed: string): string;
}

export function sealerFrom(keyBase64: string): Sealer {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) throw new Error("BANK_DETAILS_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)");
  return {
    seal(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      return ["v1", iv, cipher.getAuthTag(), body].map((p) => (typeof p === "string" ? p : p.toString("base64url"))).join(":");
    },
    open(sealed) {
      const [version, iv, tag, body] = sealed.split(":");
      if (version !== "v1" || !iv || !tag || !body) throw new Error("Not sealed bank details");
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
      decipher.setAuthTag(Buffer.from(tag, "base64url"));
      return Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
    },
  };
}
