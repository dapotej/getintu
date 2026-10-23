// The scanner's checks with no signal (spec: Offline scan flow). The QR code's signatures and
// time are checked against the server's public keys, the cached rules run through the same
// rules engine the server uses, and an approval is stored on the device to sync later.
import { fromBase64url, verifyCode } from "@intu/qr";
import { benefitFor, evaluateOffline, serviceDate } from "@intu/rules";
import { allVisits, putVisit } from "./store";
import type { PendingVisit, ScanOutcome, VenueBundle } from "./types";

export function scanOffline(bundle: VenueBundle, input: { code: string; offerId: string; partySize: number; vehicleId?: string | null }, visitsOnDevice: PendingVisit[], now: Date): { outcome: ScanOutcome; visit: PendingVisit | null } {
  const offer = bundle.offers.find((o) => o.id === input.offerId);
  if (!offer) return { outcome: { kind: "invalid", problem: "malformed" }, visit: null };
  const keys = new Map(bundle.keys.map((k) => [k.keyId, fromBase64url(k.publicKey)]));
  const verified = verifyCode(input.code, { publicKeys: keys, now });
  if (!verified.ok) return { outcome: { kind: "invalid", problem: verified.error }, visit: null };
  const { pass } = verified;
  if (bundle.revocations.devices.includes(pass.deviceId)) return { outcome: { kind: "invalid", problem: "device_revoked" }, visit: null };

  // A visiting service needs a booking for the day: checked against the cached bookings.
  const day = serviceDate(bundle.venue.openingHours, now);
  const booked = (bundle.bookings ?? []).some((b) => b.membershipId === pass.membershipId && b.bookingDate === day && (b.offerId === null || b.offerId === offer.id));
  const decision = evaluateOffline({
    now,
    membership: { id: pass.membershipId, revoked: bundle.revocations.memberships.includes(pass.membershipId), startsOn: pass.startsOn, endsOn: pass.endsOn },
    venue: bundle.venue,
    offer,
    benefit: benefitFor(
      bundle.benefits.filter((b) => b.planId === pass.planId),
      offer.categoryCode,
    ),
    partySize: input.partySize,
    visitsOnDevice: visitsOnDevice
      .filter((v) => v.status !== "rejected")
      .map((v) => ({ membershipId: v.membershipId, venueId: bundle.venue.id, offerId: v.offerId, serviceDate: v.serviceDate, occurredAt: new Date(v.occurredAt) })),
    booking: { required: bundle.venue.kind === "visiting", found: booked },
  });
  const outcome: ScanOutcome = { kind: "decision", decision, member: { name: pass.name, photoUrl: null }, offerName: offer.name, partySize: input.partySize, offline: true };
  if (decision.result !== "approved") return { outcome, visit: null };
  return {
    outcome,
    visit: {
      id: crypto.randomUUID(),
      code: input.code,
      offerId: offer.id,
      offerName: offer.name,
      partySize: input.partySize,
      vehicleId: input.vehicleId ?? null,
      occurredAt: now.toISOString(),
      membershipId: pass.membershipId,
      memberName: pass.name,
      serviceDate: decision.serviceDate,
      status: "pending",
    },
  };
}

/** Runs the offline checks and keeps an approval on the device. */
export async function scanAndStoreOffline(bundle: VenueBundle, input: { code: string; offerId: string; partySize: number; vehicleId?: string | null }, now = new Date()) {
  const { outcome, visit } = scanOffline(bundle, input, await allVisits(), now);
  if (visit) await putVisit(visit);
  return outcome;
}
