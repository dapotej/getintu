// Member passes: certificates for a device's rotating QR code, the daily backup code, and the
// checks a scan makes before the rules engine runs.
import { randomInt } from "node:crypto";
import { and, eq, gte, inArray, isNull, ne } from "drizzle-orm";
import { audit, one, schema, type Db, type Tx } from "@intu/db";
import { fromBase64url, PASS_LIFETIME_SECONDS, parseSecretKey, signPass, toBase64url, verifyCode, type CodeError, type PassFields } from "@intu/qr";
import { shiftDate, toLagos } from "@intu/rules";

const { devices, members, memberships, passCodes } = schema;

export interface PassKeys {
  /** Signs new pass certificates. */
  current: { keyId: number; secretKey: Uint8Array; publicKey: Uint8Array };
  /** Every key a scanner should trust, including retired ones whose passes haven't expired. */
  publicKeys: ReadonlyMap<number, Uint8Array>;
}

/** From QR_SIGNING_KEY ("<id>:<base64url secret>") and QR_PUBLIC_KEYS ("<id>:<base64url public>,…"). */
export function passKeysFrom(signingKey: string, extraPublicKeys = ""): PassKeys {
  const current = parseSecretKey(signingKey);
  const publicKeys = new Map<number, Uint8Array>([[current.keyId, current.publicKey]]);
  for (const entry of extraPublicKeys.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [id, key] = entry.split(":");
    if (!id || !key) throw new Error("QR_PUBLIC_KEYS entries are <id>:<base64url public key>");
    publicKeys.set(Number(id), fromBase64url(key));
  }
  return { current, publicKeys };
}

export const publishedKeys = (keys: PassKeys) => [...keys.publicKeys].map(([keyId, key]) => ({ keyId, publicKey: toBase64url(key) }));

export const lagosToday = (now: Date) => toLagos(now).date;

/** The member's backup code for a Lagos day, made on first use. */
export async function backupCodeFor(tx: Db | Tx, membershipId: string, day: string): Promise<string> {
  const [existing] = await tx.select().from(passCodes).where(and(eq(passCodes.membershipId, membershipId), eq(passCodes.validOn, day)));
  if (existing) return existing.code;
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const [row] = await tx.insert(passCodes).values({ membershipId, code, validOn: day }).onConflictDoNothing().returning();
    if (row) return row.code;
    // Either the code is taken today or another request just made this pass's code.
    const [raced] = await tx.select().from(passCodes).where(and(eq(passCodes.membershipId, membershipId), eq(passCodes.validOn, day)));
    if (raced) return raced.code;
  }
  throw new Error("Couldn't find a free backup code");
}

/**
 * Registers a device for a membership and signs its pass. The device keeps its own secret key;
 * only the public key reaches the server.
 */
export async function issuePass(
  db: Db,
  keys: PassKeys,
  input: { membershipId: string; devicePublicKey: string; platform: string; actor: { type: "staff"; id: string } | { type: "member"; id: string } },
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    const [ms] = await tx
      .select({ membership: memberships, member: { id: members.id, fullName: members.fullName } })
      .from(memberships)
      .innerJoin(members, eq(members.id, memberships.memberId))
      .where(and(eq(memberships.id, input.membershipId), isNull(memberships.deletedAt)));
    if (!ms) return null;
    const publicKey = fromBase64url(input.devicePublicKey);
    if (publicKey.length !== 32) throw new RangeError("A device public key is 32 bytes");

    const device = one(await tx.insert(devices).values({ memberId: ms.member.id, publicKey: input.devicePublicKey, platform: input.platform }).returning());
    await audit(tx, input.actor, { action: "device.registered", entity: "device", entityId: device.id, after: device });

    const expiresAt = new Date(now.getTime() + PASS_LIFETIME_SECONDS * 1000);
    const fields: PassFields = {
      keyId: keys.current.keyId,
      membershipId: ms.membership.id,
      deviceId: device.id,
      planId: ms.membership.planId,
      startsOn: ms.membership.startsOn,
      endsOn: ms.membership.endsOn,
      name: ms.member.fullName,
      expiresAt,
      devicePublicKey: publicKey,
    };
    const today = lagosToday(now);
    return {
      deviceId: device.id,
      certificate: toBase64url(signPass(fields, keys.current.secretKey)),
      expiresAt,
      backupCodes: [
        { validOn: today, code: await backupCodeFor(tx, ms.membership.id, today) },
        { validOn: shiftDate(today, 1), code: await backupCodeFor(tx, ms.membership.id, shiftDate(today, 1)) },
      ],
    };
  });
}

export interface Identity {
  membershipId: string;
  memberId: string;
  name: string;
  photoPath: string | null;
  scanCode: string | null;
}

export type ScanIdentity =
  | ({ ok: true } & Identity)
  /** A revoked device still says whose pass it was, so a visit synced from offline can be flagged. */
  | { ok: false; error: "device_revoked"; identity: Identity }
  | { ok: false; error: CodeError | "unknown_backup_code" | "unknown_pass" };

/**
 * Who is at the door: from a QR code (signatures, time and device checked), or from a backup
 * code (today's or, after midnight, yesterday's). The rules engine decides the rest.
 */
export async function identify(
  db: Db,
  keys: PassKeys,
  scan: { code?: string | undefined; backupCode?: string | undefined },
  now: Date,
  /** When the visit happened in server time, if `now` is another clock's (an offline scanner's). */
  visitTime: Date = now,
): Promise<ScanIdentity> {
  if (scan.code) {
    const verified = verifyCode(scan.code, { publicKeys: keys.publicKeys, now });
    if (!verified.ok) return verified;
    const [row] = await db
      .select({ device: devices, membership: memberships, member: members })
      .from(devices)
      .innerJoin(memberships, eq(memberships.id, verified.pass.membershipId))
      .innerJoin(members, eq(members.id, memberships.memberId))
      .where(eq(devices.id, verified.pass.deviceId));
    if (!row || row.device.memberId !== row.member.id) return { ok: false, error: "unknown_pass" };
    if (row.device.publicKey !== toBase64url(verified.pass.devicePublicKey)) return { ok: false, error: "unknown_pass" };
    const identity = { membershipId: row.membership.id, memberId: row.member.id, name: row.member.fullName, photoPath: row.member.photoPath, scanCode: scan.code };
    if (row.device.revokedAt && row.device.revokedAt <= visitTime) return { ok: false, error: "device_revoked", identity };
    return { ok: true, ...identity };
  }
  const today = lagosToday(now);
  const [row] = await db
    .select({ membership: memberships, member: members })
    .from(passCodes)
    .innerJoin(memberships, eq(memberships.id, passCodes.membershipId))
    .innerJoin(members, eq(members.id, memberships.memberId))
    .where(and(eq(passCodes.code, scan.backupCode ?? ""), inArray(passCodes.validOn, [today, shiftDate(today, -1)])))
    .orderBy(passCodes.validOn)
    .limit(1);
  if (!row) return { ok: false, error: "unknown_backup_code" };
  return { ok: true, membershipId: row.membership.id, memberId: row.member.id, name: row.member.fullName, photoPath: row.member.photoPath, scanCode: null };
}

/**
 * What a scanner must refuse offline: devices revoked while a pass they hold could still be
 * valid, and passes that aren't active and haven't ended (ended ones fail their dates anyway).
 */
export async function revocations(db: Db, now: Date) {
  const since = new Date(now.getTime() - PASS_LIFETIME_SECONDS * 1000);
  const revokedDevices = await db.select({ id: devices.id }).from(devices).where(gte(devices.revokedAt, since));
  const inactive = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(ne(memberships.status, "active"), gte(memberships.endsOn, shiftDate(lagosToday(now), -1))));
  return { generatedAt: now.toISOString(), devices: revokedDevices.map((d) => d.id), memberships: inactive.map((m) => m.id) };
}
