// The API as configured from environment variables, shared by the long-running server
// (server.ts) and the Vercel function (vercel.ts).
import { randomBytes } from "node:crypto";
import { createLocalJWKSet } from "jose";
import { createDb } from "@intu/db";
import { generateKeyPair, toBase64url } from "@intu/qr";
import { createApp } from "./app.ts";
import { createSupabaseAuthAdmin } from "./auth/supabase-admin.ts";
import { createTokenVerifier } from "./auth/tokens.ts";
import type { Env } from "./env.ts";
import { passKeysFrom } from "./passes.ts";

export function appFromEnv(env: Env, opts: { poolSize?: number } = {}) {
  // Development and tests can run without keys: throwaway ones last until the server restarts,
  // so passes and shift sessions issued before a restart stop working.
  const signingKey = env.QR_SIGNING_KEY ?? `1:${toBase64url(generateKeyPair().secretKey)}`;
  const partnerSessionSecret = env.PARTNER_SESSION_SECRET ?? randomBytes(32).toString("base64url");
  if (!env.QR_SIGNING_KEY || !env.PARTNER_SESSION_SECRET) console.warn("QR_SIGNING_KEY or PARTNER_SESSION_SECRET not set: using throwaway keys until restart");
  const { db } = createDb(env.DATABASE_URL, opts.poolSize ? { max: opts.poolSize } : {});
  return createApp({
    db,
    verify: createTokenVerifier(
      env.TEST_JWKS_JSON
        ? { supabaseUrl: env.SUPABASE_URL, jwks: createLocalJWKSet(JSON.parse(env.TEST_JWKS_JSON)) }
        : env.SUPABASE_JWT_SECRET
          ? { supabaseUrl: env.SUPABASE_URL, secret: env.SUPABASE_JWT_SECRET }
          : { supabaseUrl: env.SUPABASE_URL },
    ),
    authAdmin: createSupabaseAuthAdmin({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }),
    corsOrigins: env.CORS_ORIGINS.split(",").map((s) => s.trim()).filter(Boolean),
    inviteRedirectUrl: env.ADMIN_INVITE_REDIRECT_URL,
    passKeys: passKeysFrom(signingKey, env.QR_PUBLIC_KEYS),
    partnerSessionSecret,
  });
}
