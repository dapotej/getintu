// Supabase Auth only: members sign in with their phone and a one-time code. Everything else goes
// through the intu API.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { config } from "./config";

export const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: {
    ...(Platform.OS === "web" ? {} : { storage: AsyncStorage }),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
