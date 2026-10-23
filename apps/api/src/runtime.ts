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
import { memoryPhotoStore, supabasePhotoStore } from "./member/photos.ts";
import { passKeysFrom } from "./passes.ts";
import { createPayments } from "./payments/setup.ts";

export function appFromEnv(env: Env, opts: { poolSize?: number; connectTimeoutSeconds?: number } = {}) {
  return apiFromEnv(env, opts).app;
}

/** The API plus a way to close its database connections. */
export function apiFromEnv(env: Env, opts: { poolSize?: number; connectTimeoutSeconds?: number } = {}) {
  // Development and tests can run without keys: throwaway ones last until the server restarts,
  // so passes and shift sessions issued before a restart stop working.
  const signingKey = env.QR_SIGNING_KEY ?? `1:${toBase64url(generateKeyPair().secretKey)}`;
  const partnerSessionSecret = env.PARTNER_SESSION_SECRET ?? randomBytes(32).toString("base64url");
  if (!env.QR_SIGNING_KEY || !env.PARTNER_SESSION_SECRET) console.warn("QR_SIGNING_KEY or PARTNER_SESSION_SECRET not set: using throwaway keys until restart");
  const { db, sql } = createDb(env.DATABASE_URL, { ...(opts.poolSize ? { max: opts.poolSize } : {}), ...(opts.connectTimeoutSeconds ? { connectTimeoutSeconds: opts.connectTimeoutSeconds } : {}) });
  const app = createApp({
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
    photos: env.PHOTO_STORE === "memory" ? memoryPhotoStore() : supabasePhotoStore({ supabaseUrl: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY }),
    memberApp: { conciergeWhatsApp: env.CONCIERGE_WHATSAPP ?? null, newMembersAreTest: env.NODE_ENV !== "production" },
    smsHook: { secret: env.SUPABASE_SMS_HOOK_SECRET },
    payments: createPayments({
      apiUrl: env.API_PUBLIC_URL?.replace(/\/$/, "") ?? null,
      stripe: env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET ? { secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET } : undefined,
      paystack: env.PAYSTACK_SECRET_KEY ? { secretKey: env.PAYSTACK_SECRET_KEY } : undefined,
      allowTest: env.NODE_ENV !== "production",
    }),
  });
  return { app, close: () => sql.end({ timeout: 0 }) };
}

type Api = { app: { fetch: (req: Request) => Response | Promise<Response> }; close: () => Promise<void> };

/**
 * Serves requests from an API that is rebuilt, with fresh database connections, when a request
 * arrives after a quiet spell. A serverless instance is paused between requests, and the pooler
 * can drop its connection meanwhile: a query on a dropped connection can hang until the
 * platform's time limit. Nothing is rebuilt while a request is still running.
 */
export function freshAfterQuiet(make: () => Api, opts: { quietMs: number; now?: () => number }) {
  const now = opts.now ?? Date.now;
  let api = make();
  let lastActive = now();
  let running = 0;
  return async (req: Request) => {
    if (running === 0 && now() - lastActive > opts.quietMs) {
      const stale = api;
      api = make();
      stale.close().catch(() => {});
    }
    running++;
    try {
      return await api.app.fetch(req);
    } finally {
      running--;
      lastActive = now();
    }
  };
}
