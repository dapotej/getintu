// Two kinds of storage on the phone: the secure keychain for the pass's secret key, and plain
// storage for cached data so the app works with no signal. On the web build (tests and previews)
// both fall back to the browser's localStorage.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const web = Platform.OS === "web";

export const secret = {
  get: (key: string) => (web ? Promise.resolve(globalThis.localStorage?.getItem(key) ?? null) : SecureStore.getItemAsync(key)),
  set: (key: string, value: string) => (web ? Promise.resolve(globalThis.localStorage?.setItem(key, value)) : SecureStore.setItemAsync(key, value)),
  remove: (key: string) => (web ? Promise.resolve(globalThis.localStorage?.removeItem(key)) : SecureStore.deleteItemAsync(key)),
};

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch {
      return null;
    }
  },
  async set(key: string, value: unknown) {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
      // A full disk shouldn't break the screen; the data just won't be there offline.
    }
  },
  /** Forgets everything cached for the member who signed out. */
  async clear() {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith("intu."));
    await AsyncStorage.multiRemove(keys);
  },
};
