// The pass key is made with the phone's secure random number generator. Hermes has no Web
// Crypto, so give @noble/curves the one Expo provides.
import { getRandomValues } from "expo-crypto";

const g = globalThis as { crypto?: { getRandomValues?: unknown } };
if (!g.crypto) g.crypto = {};
if (typeof g.crypto.getRandomValues !== "function") g.crypto.getRandomValues = getRandomValues;
