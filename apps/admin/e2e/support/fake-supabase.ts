// A stand-in for Supabase Auth, served to the browser through Playwright's network interception.
// It speaks the GoTrue endpoints supabase-js calls for password sign-in and TOTP two-step, and
// signs real ES256 tokens the API verifies, so everything after sign-in is the real system.
import type { Page, Route } from "@playwright/test";
import { importJWK, SignJWT } from "jose";
import { E2E_PRIVATE_JWK } from "./keys";

export const FAKE_SUPABASE_URL = "http://supabase.test";
export const GOOD_CODE = "123456";

export interface FakeAccount {
  authUserId: string;
  email: string;
  password: string;
  /** Whether two-step is already set up (returning user) or will be enrolled now (first sign-in). */
  enrolled: boolean;
}

const privateKey = importJWK(E2E_PRIVATE_JWK, "ES256");

async function accessToken(account: FakeAccount, aal: "aal1" | "aal2") {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    aal,
    amr: aal === "aal2" ? [{ method: "totp", timestamp: now }, { method: "password", timestamp: now }] : [{ method: "password", timestamp: now }],
    email: account.email,
    role: "authenticated",
    session_id: "e2e-session",
  })
    .setProtectedHeader({ alg: "ES256", kid: E2E_PRIVATE_JWK.kid, typ: "JWT" })
    .setSubject(account.authUserId)
    .setIssuer(`${FAKE_SUPABASE_URL}/auth/v1`)
    .setAudience("authenticated")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await privateKey);
}

export async function fakeSupabase(page: Page, account: FakeAccount) {
  const factor = { id: "factor-1", factor_type: "totp", friendly_name: "intu admin", status: account.enrolled ? "verified" : "unverified", created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  let hasFactor = account.enrolled;
  let level: "aal1" | "aal2" = "aal1";

  const user = () => ({
    id: account.authUserId,
    aud: "authenticated",
    role: "authenticated",
    email: account.email,
    app_metadata: { provider: "email" },
    user_metadata: {},
    factors: hasFactor ? [factor] : [],
    created_at: new Date().toISOString(),
  });
  const session = async () => ({
    access_token: await accessToken(account, level),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `refresh-${level}`,
    user: user(),
  });
  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*" } });

  await page.route(`${FAKE_SUPABASE_URL}/auth/v1/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace("/auth/v1", "");
    const body = req.postDataJSON?.() as Record<string, string> | null;
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });

    if (path === "/token" && url.searchParams.get("grant_type") === "password") {
      if (body?.email !== account.email || body.password !== account.password) return json(route, 400, { code: "invalid_credentials", error_code: "invalid_credentials", msg: "Invalid login credentials" });
      level = "aal1";
      return json(route, 200, await session());
    }
    if (path === "/token" && url.searchParams.get("grant_type") === "refresh_token") return json(route, 200, await session());
    if (path === "/user") return json(route, 200, user());
    if (path === "/factors" && req.method() === "POST") {
      hasFactor = true;
      factor.status = "unverified";
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>';
      return json(route, 200, { id: factor.id, type: "totp", friendly_name: factor.friendly_name, totp: { qr_code: svg, secret: "JBSWY3DPEHPK3PXP", uri: "otpauth://totp/intu:e2e?secret=JBSWY3DPEHPK3PXP" } });
    }
    if (path.startsWith("/factors/") && req.method() === "DELETE") {
      hasFactor = false;
      return json(route, 200, { id: factor.id });
    }
    if (path.endsWith("/challenge")) return json(route, 200, { id: "challenge-1", type: "totp", expires_at: Math.floor(Date.now() / 1000) + 300 });
    if (path.endsWith("/verify")) {
      if (body?.code !== GOOD_CODE) return json(route, 422, { code: "mfa_verification_failed", error_code: "mfa_verification_failed", msg: "Invalid TOTP code entered" });
      factor.status = "verified";
      level = "aal2";
      return json(route, 200, await session());
    }
    if (path === "/logout") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    return json(route, 404, { msg: `Fake Supabase has no ${req.method()} ${path}` });
  });
}
