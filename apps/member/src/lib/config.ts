// Addresses baked in at build time from EXPO_PUBLIC_* variables (Expo inlines them).
export const config = {
  apiUrl: (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787").replace(/\/$/, ""),
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "http://supabase.test",
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "public-anon-key",
};
