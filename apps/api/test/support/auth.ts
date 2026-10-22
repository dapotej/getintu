// Real signed tokens for tests: a local ES256 key stands in for the Supabase project's signing key.
import { randomUUID } from "node:crypto";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { one, schema, type Db } from "@intu/db";
import { createApp } from "../../src/app.ts";
import type { StaffRole } from "../../src/auth/permissions.ts";
import type { AuthAdmin } from "../../src/auth/supabase-admin.ts";
import { createTokenVerifier } from "../../src/auth/tokens.ts";
import { generateKeyPair as generatePassKeys, toBase64url } from "@intu/qr";
import { passKeysFrom } from "../../src/passes.ts";

/** Pass signing keys and a shift-session secret for tests. */
export const passKeys = passKeysFrom(`1:${toBase64url(generatePassKeys().secretKey)}`);
export const PARTNER_SESSION_SECRET = "test-partner-session-secret-0123456789";

export const SUPABASE_URL = "https://test-project.supabase.co";
const ISSUER = `${SUPABASE_URL}/auth/v1`;

const { publicKey, privateKey } = await generateKeyPair("ES256");
const jwk = { ...(await exportJWK(publicKey)), kid: "test-key", alg: "ES256", use: "sig" };
export const jwks = createLocalJWKSet({ keys: [jwk] });

export async function signToken(opts: { sub: string; aal?: "aal1" | "aal2"; issuer?: string; expiresIn?: string; key?: Parameters<SignJWT["sign"]>[0] }) {
  return new SignJWT({ aal: opts.aal ?? "aal2", role: "authenticated", email: "staff@example.com" })
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setSubject(opts.sub)
    .setIssuer(opts.issuer ?? ISSUER)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? "1h")
    .sign(opts.key ?? privateKey);
}

export function fakeAuthAdmin() {
  const invited: { email: string; id: string }[] = [];
  const banned: string[] = [];
  const admin: AuthAdmin = {
    async inviteUser(email) {
      const id = randomUUID();
      invited.push({ email, id });
      return { id };
    },
    async banUser(id) {
      banned.push(id);
    },
  };
  return { admin, invited, banned };
}

export async function createStaff(db: Db, role: StaffRole, extra: Partial<typeof schema.staffUsers.$inferInsert> = {}) {
  const tag = randomUUID().slice(0, 8);
  return one(
    await db
      .insert(schema.staffUsers)
      .values({ role, fullName: `TEST Staff ${tag}`, email: `staff+${tag}@example.com`, authUserId: randomUUID(), isTest: true, ...extra })
      .returning(),
  );
}

/** The API with test auth, plus a helper that makes authenticated JSON requests as a given staff member. */
export function testApi(db: Db, opts: { clock?: () => Date } = {}) {
  const auth = fakeAuthAdmin();
  const app = createApp({
    db,
    verify: createTokenVerifier({ supabaseUrl: SUPABASE_URL, jwks }),
    authAdmin: auth.admin,
    corsOrigins: ["http://localhost:3001"],
    passKeys,
    partnerSessionSecret: PARTNER_SESSION_SECRET,
    ...(opts.clock ? { clock: opts.clock } : {}),
  });

  const as = (staff: { authUserId: string | null }, aal: "aal1" | "aal2" = "aal2") => {
    const call = async (method: string, path: string, body?: unknown) => {
      const token = await signToken({ sub: staff.authUserId ?? "", aal });
      const res = await app.request(path, {
        method,
        headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { status: res.status, json: (await res.json()) as any };
    };
    return {
      get: (path: string) => call("GET", path),
      post: (path: string, body?: unknown) => call("POST", path, body ?? {}),
      patch: (path: string, body: unknown) => call("PATCH", path, body),
      put: (path: string, body: unknown) => call("PUT", path, body),
      delete: (path: string) => call("DELETE", path),
    };
  };
  return { app, auth, as };
}
