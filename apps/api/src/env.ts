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
  // Signs partner staff shift sessions. At least 32 random characters.
  PARTNER_SESSION_SECRET: z.string().min(32).optional(),
  // Supabase Auth's Send SMS hook secret ("v1,whsec_…"), from Authentication → Hooks.
  SUPABASE_SMS_HOOK_SECRET: z.string().min(1).optional(),
  // Who delivers sign-in codes. Only "test" (deliver nothing; TEST numbers use a fixed code) for now.
  CODE_SENDER: z.enum(["test"]).default("test"),
  // The concierge's WhatsApp number, in E.164 (+234…). The doctor's line is the medical partner's, set in the console.
  CONCIERGE_WHATSAPP: z.string().regex(/^\+\d{8,15}$/).optional(),
  // Where member photos are kept: Supabase Storage, or in memory for local development.
  PHOTO_STORE: z.enum(["supabase", "memory"]).default("supabase"),
  // The API's own public address: payment pages send members back here, and TEST payments live here.
  // Optional: without it, each checkout uses the address its request came in on.
  API_PUBLIC_URL: z.url().optional(),
  // Stripe (pounds and dollars): the secret key and the webhook's signing secret, both from the Stripe dashboard.
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  // Paystack (naira): the secret key, which also checks its webhooks.
  PAYSTACK_SECRET_KEY: z.string().min(1).optional(),
  // Encrypts partners' bank account numbers: 32 random bytes, base64 (openssl rand -base64 32).
  // Keep it safe: without it, saved bank details can't be read, only set again.
  BANK_DETAILS_KEY: z.string().min(40).optional(),
  // What the scheduler sends to run jobs (monthly statements): at least 32 random characters.
  JOBS_SECRET: z.string().min(32).optional(),
  // Live keys are refused unless this is "yes": payments stay in test mode until Dapo says otherwise.
  PAYMENTS_LIVE: z.enum(["yes", "no"]).default("no"),
});

export type Env = z.infer<typeof Env>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const env = Env.parse(source);
  if (env.TEST_JWKS_JSON && env.NODE_ENV !== "test") throw new Error("TEST_JWKS_JSON is only allowed when NODE_ENV=test");
  if ((env.NODE_ENV === "staging" || env.NODE_ENV === "production") && (!env.QR_SIGNING_KEY || !env.PARTNER_SESSION_SECRET)) {
    throw new Error("QR_SIGNING_KEY and PARTNER_SESSION_SECRET are required in staging and production");
  }
  if (Boolean(env.STRIPE_SECRET_KEY) !== Boolean(env.STRIPE_WEBHOOK_SECRET)) throw new Error("Set both STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET, or neither");
  const live = [env.STRIPE_SECRET_KEY, env.PAYSTACK_SECRET_KEY].some((k) => k?.startsWith("sk_live_"));
  if (live && env.PAYMENTS_LIVE !== "yes") throw new Error("Live payment keys are set but PAYMENTS_LIVE isn't yes: use test keys until going live");
  if (env.NODE_ENV === "production" && (!env.STRIPE_SECRET_KEY || !env.PAYSTACK_SECRET_KEY)) throw new Error("Stripe and Paystack keys are required in production");
  return env;
}
