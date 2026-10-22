import type { BenefitInput, Decision, DeclineReason, OfferInput, VenueInput } from "@intu/rules";

export interface Session {
  token: string;
  expiresAt: string;
  staff: { id: string; fullName: string };
  venue: { id: string; name: string };
}

/** Everything the scanner caches from GET /partner/venue to work offline. */
export interface VenueBundle {
  serverTime: string;
  /** When this device fetched it, by its own clock. */
  fetchedAt?: string;
  staff: { id: string; fullName: string };
  venue: VenueInput & { name: string; area: string; kind: "place" | "visiting" };
  /** Visiting services: confirmed, unused bookings around today, for offline checks. */
  bookings: { id: string; membershipId: string | null; offerId: string | null; bookingDate: string }[];
  offers: (OfferInput & { name: string; description: string | null })[];
  benefits: (BenefitInput & { planId: string; name: string })[];
  keys: { keyId: number; publicKey: string }[];
  revocations: Revocations;
}

export interface Revocations {
  generatedAt: string;
  devices: string[];
  memberships: string[];
}

export type CodeProblem =
  | "malformed"
  | "unknown_key"
  | "bad_pass_signature"
  | "pass_expired"
  | "bad_code_signature"
  | "code_expired"
  | "device_revoked"
  | "unknown_backup_code"
  | "unknown_pass"
  | "needs_signal";

/** What the result screen shows, from the server or from an offline check. */
export type ScanOutcome =
  | {
      kind: "decision";
      decision: Decision;
      member: { name: string; photoUrl: string | null };
      offerName: string;
      partySize: number;
      offline: boolean;
    }
  | { kind: "invalid"; problem: CodeProblem };

/** A visit approved offline, kept on the device until the server has it. */
export interface PendingVisit {
  id: string;
  code: string;
  offerId: string;
  offerName: string;
  partySize: number;
  occurredAt: string;
  membershipId: string;
  memberName: string;
  serviceDate: string;
  status: "pending" | "synced" | "flagged" | "rejected";
  error?: string;
}

export interface TodayVisit {
  id: string;
  occurredAt: string;
  memberName: string;
  offerName: string;
  result: "approved" | "declined";
  reason: DeclineReason | null;
  partySize: number;
  method: "online" | "offline" | "manual";
  flagged: boolean;
}

export interface TodayBooking {
  id: string;
  memberName: string;
  partySize: number;
  status: string;
  eventName: string | null;
  notes: string | null;
  offerName: string | null;
  /** Already used at a scan. */
  used: boolean;
}

/** POST /scan's answer. */
export type ScanResponse =
  | { result: "invalid"; error: CodeProblem }
  | {
      result: "approved" | "declined";
      redemptionId: string;
      serviceDate: string;
      units?: number;
      remaining?: number | null;
      reason?: DeclineReason;
      claimedAt?: string;
      member: { name: string; photoUrl: string | null };
      offer: { id: string; name: string };
      partySize: number;
    };

export function outcomeFrom(res: ScanResponse): ScanOutcome {
  if (res.result === "invalid") return { kind: "invalid", problem: res.error };
  const decision: Decision =
    res.result === "approved"
      ? { result: "approved", serviceDate: res.serviceDate, units: res.units ?? 1, remaining: res.remaining ?? null }
      : res.reason === "DUPLICATE_SCAN"
        ? { result: "declined", serviceDate: res.serviceDate, reason: "DUPLICATE_SCAN", claimedAt: new Date(res.claimedAt ?? Date.now()) }
        : { result: "declined", serviceDate: res.serviceDate, reason: res.reason ?? "MEMBERSHIP_NOT_ACTIVE" };
  return { kind: "decision", decision, member: res.member, offerName: res.offer.name, partySize: res.partySize, offline: false };
}
