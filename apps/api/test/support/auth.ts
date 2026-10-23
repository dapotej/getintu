// Real signed tokens for tests: a local ES256 key stands in for the Supabase project's signing key.
import { randomUUID } from "node:crypto";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { one, schema, type Db } from "@intu/db";
import { createApp } from "../../src/app.ts";
import { memoryPhotoStore } from "../../src/member/photos.ts";
import type { Payments } from "../../src/payments/providers.ts";
import type { Sealer } from "../../src/settlements/sealed.ts";
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

export async function signToken(opts: { sub: string; aal?: "aal1" | "aal2"; issuer?: string; expiresIn?: string; key?: Parameters<SignJWT["sign"]>[0]; phone?: string; email?: string }) {
  // Staff sign in by email; members by phone, which Supabase puts in the token without its +.
  // A member who confirmed an email on their account has both.
  const claims = opts.phone ? { aal: "aal1", role: "authenticated", phone: opts.phone.replace(/^\+/, ""), ...(opts.email ? { email: opts.email } : {}) } : { aal: opts.aal ?? "aal2", role: "authenticated", email: "staff@example.com" };
  return new SignJWT(claims)
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
export const TEST_CONCIERGE = "+2348000000001";
export const SMS_HOOK_SECRET = `v1,whsec_${Buffer.from("test-sms-hook-secret-0123456789ab").toString("base64")}`;

export function testApi(db: Db, opts: { clock?: () => Date; payments?: Payments; bankDetails?: Sealer | null; jobsSecret?: string } = {}) {
  const auth = fakeAuthAdmin();
  const photos = memoryPhotoStore();
  const sent: { phone: string; code: string }[] = [];
  const app = createApp({
    db,
    verify: createTokenVerifier({ supabaseUrl: SUPABASE_URL, jwks }),
    authAdmin: auth.admin,
    corsOrigins: ["http://localhost:3001"],
    passKeys,
    partnerSessionSecret: PARTNER_SESSION_SECRET,
    photos,
    memberApp: { conciergeWhatsApp: TEST_CONCIERGE, newMembersAreTest: true },
    smsHook: { secret: SMS_HOOK_SECRET, sender: { send: async (phone, code) => void sent.push({ phone, code }) } },
    ...(opts.clock ? { clock: opts.clock } : {}),
    ...(opts.payments ? { payments: opts.payments } : {}),
    ...(opts.bankDetails !== undefined ? { bankDetails: opts.bankDetails } : {}),
    ...(opts.jobsSecret ? { jobsSecret: opts.jobsSecret } : {}),
  });

  const as = (staff: { authUserId: string | null }, aal: "aal1" | "aal2" = "aal2") => client(() => signToken({ sub: staff.authUserId ?? "", aal }));
  /** Requests as someone signed in to the member app with this phone number. */
  const asMember = (signIn: { authUserId: string; phone: string; email?: string }) => client(() => signToken({ sub: signIn.authUserId, phone: signIn.phone, ...(signIn.email ? { email: signIn.email } : {}) }));

  const client = (makeToken: () => Promise<string>) => {
    const call = async (method: string, path: string, body?: unknown) => {
      const token = await makeToken();
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
  return { app, auth, as, asMember, photos, sent };
}
