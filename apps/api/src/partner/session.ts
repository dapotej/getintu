// Door staff sign in on the venue's device with the venue's login code and their own PIN, and
// stay signed in for the shift.
import { and, eq, isNull } from "drizzle-orm";
import { createMiddleware } from "hono/factory";
import { jwtVerify, SignJWT } from "jose";
import { schema, type Db } from "@intu/db";
import { fail } from "../http.ts";

const { staffUsers, staffUserVenues, venues } = schema;

export const SHIFT_HOURS = 16;
const AUDIENCE = "intu-partner";

export interface DoorContext {
  staffId: string;
  fullName: string;
  venueId: string;
}

export type PartnerEnv = { Variables: { door: DoorContext } };

export const sessionKey = (secret: string) => new TextEncoder().encode(secret);

export function signSession(secret: string, door: { staffId: string; venueId: string }, now = new Date()) {
  return new SignJWT({ venue: door.venueId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(door.staffId)
    .setAudience(AUDIENCE)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(now.getTime() / 1000) + SHIFT_HOURS * 3600)
    .sign(sessionKey(secret));
}

/** Staff still active and still assigned to the venue, checked on every request. */
async function doorStaffAt(db: Db, staffId: string, venueId: string) {
  const [row] = await db
    .select({ id: staffUsers.id, fullName: staffUsers.fullName })
    .from(staffUsers)
    .innerJoin(staffUserVenues, and(eq(staffUserVenues.staffUserId, staffUsers.id), eq(staffUserVenues.venueId, venueId)))
    .where(and(eq(staffUsers.id, staffId), eq(staffUsers.active, true), isNull(staffUsers.deletedAt)));
  return row;
}

export function requireDoorStaff(deps: { db: Db; partnerSessionSecret: string; clock: () => Date }) {
  return createMiddleware<PartnerEnv>(async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) fail(401, "unauthenticated", "Sign in with your venue code and PIN");
    let staffId: string;
    let venueId: string;
    try {
      const { payload } = await jwtVerify(token, sessionKey(deps.partnerSessionSecret), { audience: AUDIENCE, currentDate: deps.clock() });
      staffId = String(payload.sub);
      venueId = String(payload["venue"]);
    } catch {
      fail(401, "invalid_session", "Your shift session has ended. Sign in again.");
    }
    const staff = await doorStaffAt(deps.db, staffId, venueId);
    if (!staff) fail(401, "invalid_session", "This PIN no longer works here. Ask your manager.");
    c.set("door", { staffId: staff.id, fullName: staff.fullName, venueId });
    await next();
  });
}

/** Venues whose code was mistyped too often recently: a simple guard against guessing PINs. */
export class AttemptLimiter {
  private readonly attempts = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  blocked(key: string, now: number) {
    const a = this.attempts.get(key);
    return a !== undefined && a.resetAt > now && a.count >= this.max;
  }

  fail(key: string, now: number) {
    const a = this.attempts.get(key);
    if (!a || a.resetAt <= now) this.attempts.set(key, { count: 1, resetAt: now + this.windowMs });
    else a.count += 1;
  }

  clear(key: string) {
    this.attempts.delete(key);
  }
}

export async function venueByLoginCode(db: Db, code: string) {
  const [venue] = await db
    .select({ id: venues.id, name: venues.name, active: venues.active })
    .from(venues)
    .where(and(eq(venues.loginCode, code.trim().toUpperCase()), isNull(venues.deletedAt)));
  return venue;
}
