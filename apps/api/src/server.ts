import { serve } from "@hono/node-server";
import { createLocalJWKSet } from "jose";
import { createDb } from "@intu/db";
import { createApp } from "./app.ts";
import { createSupabaseAuthAdmin } from "./auth/supabase-admin.ts";
import { createTokenVerifier } from "./auth/tokens.ts";
import { loadEnv } from "./env.ts";

const env = loadEnv();
const { db } = createDb(env.DATABASE_URL);
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
});

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`intu API listening on http://localhost:${info.port}`);
});
