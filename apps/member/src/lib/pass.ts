// This phone's pass. The phone makes its own key pair and keeps the secret half in the keychain;
// the API signs a pass for the public half. Each QR code is signed by the phone for its 30-second
// window, so a screenshot stops working within a minute, and it all works with no signal for a
// day after the pass was last renewed.
import { fromBase64url, generateKeyPair, signCode, toBase64url } from "@intu/qr";
import { Platform } from "react-native";
import { api, ApiError } from "./api";
import { needsRenewal } from "./logic";
import { cache, secret } from "./storage";
import type { StoredPass } from "./types";

const KEY = "intu.device-key";
const passKey = (membershipId: string) => `intu.pass.${membershipId}`;

let loading: Promise<{ secretKey: Uint8Array; publicKey: string; fresh: boolean }> | null = null;
/** One key per phone, even if two screens ask at once. */
const deviceKey = () => (loading ??= loadDeviceKey().catch((err: unknown) => ((loading = null), Promise.reject(err))));

async function loadDeviceKey(): Promise<{ secretKey: Uint8Array; publicKey: string; fresh: boolean }> {
  const saved = await secret.get(KEY);
  if (saved) {
    const [sk, pk] = saved.split(".");
    if (sk && pk) return { secretKey: fromBase64url(sk), publicKey: pk, fresh: false };
  }
  const pair = generateKeyPair();
  const publicKey = toBase64url(pair.publicKey);
  await secret.set(KEY, `${toBase64url(pair.secretKey)}.${publicKey}`);
  return { secretKey: pair.secretKey, publicKey, fresh: true };
}

export const storedPass = (membershipId: string) => cache.get<StoredPass>(passKey(membershipId));

/**
 * The pass for a membership, renewed if it's getting old and there's signal. Returns the stored
 * pass when offline; throws only when there's no pass at all yet.
 */
export async function ensurePass(membershipId: string, now = new Date()): Promise<StoredPass> {
  const stored = await storedPass(membershipId);
  if (!needsRenewal(stored, now) && stored) return stored;
  try {
    const key = await deviceKey();
    let pass: StoredPass | null = null;
    if (stored && !key.fresh) {
      try {
        pass = (await api<{ pass: StoredPass }>(`/me/devices/${stored.deviceId}/pass`, { body: { membershipId } })).pass;
      } catch (err) {
        // Revoked or unknown: register this phone again below.
        if (!(err instanceof ApiError && err.code === "device_not_found")) throw err;
      }
    }
    pass ??= (await api<{ pass: StoredPass }>("/me/devices", { body: { membershipId, publicKey: key.publicKey, platform: Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web" } })).pass;
    await cache.set(passKey(membershipId), pass);
    return pass;
  } catch (err) {
    if (stored) return stored;
    throw err;
  }
}

/** The code for the current 30-second window. */
export async function currentCode(pass: StoredPass, now = new Date()): Promise<string> {
  const key = await deviceKey();
  return signCode(fromBase64url(pass.certificate), key.secretKey, now);
}

/** On sign-out the key goes too, so the next person on this phone can't use the pass. */
export async function forgetDevice() {
  loading = null;
  await secret.remove(KEY);
}
