// The shapes the intu API returns to the member app.

export interface Me {
  member: { id: string; fullName: string; phone: string; email: string | null; country: string | null; consentMarketing: boolean; hasPhoto: boolean; photoUrl: string | null; isTest: boolean } | null;
  /** Only when there's no member yet: the number they signed in with. */
  phone?: string;
  concierge: { whatsapp: string } | null;
  doctorOnCall: { phone: string } | null;
}

export interface Allowance {
  id: string;
  name: string;
  code: string;
  night: boolean;
  granted: number | null;
  used: number;
  remaining: number | null;
  period: "per_pass" | "per_month" | "per_year";
  periodEnd: string;
  sharedByCrew: boolean;
}

export interface Membership {
  id: string;
  plan: { id: string; name: string };
  passNumber: string | null;
  status: "pending" | "active" | "suspended" | "ended" | "cancelled";
  startsOn: string;
  endsOn: string;
  arrivesOn: string | null;
  departsOn: string | null;
  crew: boolean;
  allowances: Allowance[];
}

export interface Visit {
  id: string;
  occurredAt: string;
  serviceDate: string;
  partySize: number;
  venue: { id: string; name: string; area: string };
  service: string;
}

export interface VenueOffer {
  id: string;
  name: string;
  code: string;
  description: string | null;
  included: boolean;
}

export type Hours = Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", { open: string; close: string }[]>;

export interface Venue {
  id: string;
  name: string;
  area: string;
  city: "lagos" | "abuja";
  kind: "place" | "visiting";
  category: { code: string; name: string };
  /** The top of the catalogue it sits under, e.g. Beach & Water. */
  section: { code: string; name: string };
  night: boolean;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  openingHours: Hours;
  openNow: boolean;
  included: boolean;
  offers: VenueOffer[];
}

export type BookingStatus = "requested" | "confirmed" | "declined" | "cancelled" | "completed" | "no_show";

export interface Booking {
  id: string;
  membershipId: string | null;
  bookingDate: string;
  partySize: number;
  status: BookingStatus;
  notes: string | null;
  createdAt: string;
  venue: { id: string; name: string; area: string; kind: "place" | "visiting" } | null;
  offerName: string | null;
}

/** A signed pass for this phone, kept so the QR works with no signal. */
export interface StoredPass {
  deviceId: string;
  certificate: string;
  expiresAt: string;
  backupCodes: { validOn: string; code: string }[];
}
