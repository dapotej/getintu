import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.url(),
  // Supabase Auth: tokens are verified against the project's published signing keys.
  SUPABASE_URL: z.url(),
  // Server-only. Used to invite and deactivate staff. Never sent to a browser.
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Only for projects still on Supabase's legacy shared JWT secret.
  SUPABASE_JWT_SECRET: z.string().min(1).optional(),
  // Browser origins allowed to call the API, comma-separated.
  CORS_ORIGINS: z.string().default("http://localhost:3001"),
  // End-to-end tests only: a JSON key set to trust instead of the Supabase project's. Refused unless NODE_ENV=test.
  TEST_JWKS_JSON: z.string().optional(),
  // Where Supabase sends invited staff to set their password.
  ADMIN_INVITE_REDIRECT_URL: z.url().optional(),
  // Signs member passes: "<key id>:<base64url Ed25519 secret key>". Make one with `pnpm --filter @intu/qr keygen`.
  QR_SIGNING_KEY: z.string().optional(),
  // Retired keys scanners should still trust until their passes expire: "<id>:<base64url public key>,…".
  QR_PUBLIC_KEYS: z.string().default(""),
  // Signs door staff shift sessions. At least 32 random characters.
  PARTNER_SESSION_SECRET: z.string().min(32).optional(),
});

export type Env = z.infer<typeof Env>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const env = Env.parse(source);
  if (env.TEST_JWKS_JSON && env.NODE_ENV !== "test") throw new Error("TEST_JWKS_JSON is only allowed when NODE_ENV=test");
  if ((env.NODE_ENV === "staging" || env.NODE_ENV === "production") && (!env.QR_SIGNING_KEY || !env.PARTNER_SESSION_SECRET)) {
    throw new Error("QR_SIGNING_KEY and PARTNER_SESSION_SECRET are required in staging and production");
  }
  return env;
}
