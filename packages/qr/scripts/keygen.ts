// Prints a new server key for signing passes, as QR_SIGNING_KEY expects it. Usage:
//   pnpm --filter @intu/qr keygen -- 2    (key id, default 1)
import { generateKeyPair, toBase64url } from "../src/index.ts";

const keyId = Number(process.argv.find((a) => /^\d+$/.test(a)) ?? 1);
const { secretKey, publicKey } = generateKeyPair();
console.log(`QR_SIGNING_KEY=${keyId}:${toBase64url(secretKey)}`);
console.log(`# public key ${keyId}:${toBase64url(publicKey)}`);
