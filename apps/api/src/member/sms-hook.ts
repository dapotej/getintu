// Supabase Auth's "Send SMS" hook: Supabase makes the one-time sign-in code and calls this to
// deliver it. Delivery sits behind a sender so WhatsApp and Termii can be plugged in later. Until
// then the TEST sender delivers nothing: TEST phone numbers set in Supabase use a fixed code.
import { createHmac, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { z } from "zod";
import { fail } from "../http.ts";

export interface CodeSender {
  send(phone: string, code: string): Promise<void>;
}

/** Sends nothing. Says so in the log, with the number masked and never the code. */
export const testSender: CodeSender = {
  async send(phone) {
    console.info(`TEST mode: sign-in code for ${phone.slice(0, 4)}…${phone.slice(-2)} not sent`);
  },
};

const HookBody = z.object({ user: z.object({ phone: z.string() }).loose(), sms: z.object({ otp: z.string() }).loose() }).loose();

/** Most a webhook's timestamp may differ from ours, in seconds (Standard Webhooks). */
const TOLERANCE_SECONDS = 5 * 60;

/**
 * Checks a Standard Webhooks signature, as Supabase sends: base64 HMAC-SHA256 of
 * "<id>.<timestamp>.<body>" with the secret from "v1,whsec_<base64>".
 */
export function verifyWebhook(secret: string, headers: { id: string | undefined; timestamp: string | undefined; signature: string | undefined }, body: string, now: Date): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const sent = Number(timestamp);
  if (!Number.isFinite(sent) || Math.abs(now.getTime() / 1000 - sent) > TOLERANCE_SECONDS) return false;
  const key = Buffer.from(secret.replace(/^v1,/, "").replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest();
  return signature
    .split(" ")
    .map((s) => s.split(",")[1] ?? "")
    .some((s) => {
      const given = Buffer.from(s, "base64");
      return given.length === expected.length && timingSafeEqual(given, expected);
    });
}

export function smsHookRoutes(deps: { secret: string | undefined; sender: CodeSender; clock: () => Date }) {
  const app = new Hono();
  app.post("/auth/sms-hook", async (c) => {
    if (!deps.secret) fail(404, "not_configured", "The SMS hook isn't set up");
    const raw = await c.req.text();
    const ok = verifyWebhook(deps.secret, { id: c.req.header("webhook-id"), timestamp: c.req.header("webhook-timestamp"), signature: c.req.header("webhook-signature") }, raw, deps.clock());
    if (!ok) fail(401, "bad_signature", "Not signed by Supabase");
    const { user, sms } = HookBody.parse(JSON.parse(raw));
    await deps.sender.send(`+${user.phone.replace(/^\+/, "")}`, sms.otp);
    return c.json({});
  });
  return app;
}
