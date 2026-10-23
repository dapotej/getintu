// A stand-in for Supabase Auth's phone sign-in and email codes, served to the browser through
// Playwright's network interception. It signs real ES256 tokens with the phone (and confirmed
// email) claims Supabase gives, so everything after sign-in is the real API and database.
import { randomUUID } from "node:crypto";
import type { Page, Route } from "@playwright/test";
import { importJWK, SignJWT } from "jose";
import { E2E_PRIVATE_JWK } from "./keys";

export const FAKE_SUPABASE_URL = "http://supabase.test";
/** What Supabase does for TEST phone numbers: a fixed code, nothing sent. */
export const TEST_CODE = "123456";

const privateKey = importJWK(E2E_PRIVATE_JWK, "ES256");

export async function fakeSupabase(page: Page, opts: { authUserId?: string } = {}) {
  const authUserId = opts.authUserId ?? randomUUID();
  const sent: string[] = [];
  let phone = "";
  // An email being confirmed on the account, and the one confirmed.
  let pendingEmail = "";
  let email = "";

  const user = () => ({ id: authUserId, aud: "authenticated", role: "authenticated", phone: phone.replace(/^\+/, ""), email, app_metadata: { provider: "phone" }, user_metadata: {}, created_at: new Date().toISOString() });
  const session = async () => {
    const now = Math.floor(Date.now() / 1000);
    const access_token = await new SignJWT({ aal: "aal1", role: "authenticated", phone: phone.replace(/^\+/, ""), ...(email ? { email } : {}), session_id: "e2e" })
      .setProtectedHeader({ alg: "ES256", kid: E2E_PRIVATE_JWK.kid, typ: "JWT" })
      .setSubject(authUserId)
      .setIssuer(`${FAKE_SUPABASE_URL}/auth/v1`)
      .setAudience("authenticated")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(await privateKey);
    return { access_token, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "refresh-e2e", user: user() };
  };
  const json = (route: Route, status: number, body: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body), headers: { "access-control-allow-origin": "*" } });

  await page.route(`${FAKE_SUPABASE_URL}/auth/v1/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace("/auth/v1", "");
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" } });
    const body = (req.postDataJSON?.() ?? null) as Record<string, string> | null;
    if (path === "/otp") {
      // An email code only goes to a confirmed email, as with shouldCreateUser off.
      if (body?.email && body.email !== email) return json(route, 422, { code: 422, error_code: "otp_disabled", msg: "Signups not allowed for otp" });
      sent.push(body?.phone ?? body?.email ?? "");
      return json(route, 200, {});
    }
    if (path === "/verify") {
      if (body?.token !== TEST_CODE) return json(route, 403, { code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" });
      if (body.type === "email_change") email = pendingEmail;
      else if (body.type === "email") {
        if (body.email !== email) return json(route, 403, { code: 403, error_code: "otp_expired", msg: "Token has expired or is invalid" });
      } else phone = body.phone ?? "";
      return json(route, 200, await session());
    }
    if (path === "/user" && req.method() === "PUT") {
      pendingEmail = body?.email ?? "";
      sent.push(pendingEmail);
      return json(route, 200, user());
    }
    if (path === "/token" && url.searchParams.get("grant_type") === "refresh_token") return json(route, 200, await session());
    if (path === "/user") return json(route, 200, user());
    if (path === "/logout") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    return json(route, 404, { msg: `Fake Supabase doesn't handle ${path}` });
  });
  return { authUserId, sent };
}
