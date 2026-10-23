// The shapes the intu API returns to the member app.

export interface Me {
  member: { id: string; fullName: string; phone: string; email: string | null; country: string | null; consentMarketing: boolean; hasPhoto: boolean; photoUrl: string | null; isTest: boolean } | null;
  /** Only when there's no member yet: the number they signed in with. */
  phone?: string;
  concierge: { whatsapp: string } | null;
  /** The medical partner's line, for members whose plan includes doctor on call. */
  doctorOnCall: { name: string; phone: string } | null;
}

/** How a benefit is used, set per catalogue entry in the console. */
export type UsageMode = "door" | "booking" | "airport" | "call" | "concierge" | "in_app";

export interface Allowance {
  id: string;
  name: string;
  code: string;
  night: boolean;
  usageMode: UsageMode;
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
  usageMode: UsageMode;
  /** Booked ahead for the concierge to arrange (a cabana, a club table, an airport service), decided by the API. */
  booked: boolean;
  included: boolean;
}

export type Hours = Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", { open: string; close: string }[]>;

export interface Venue {
  id: string;
  name: string;
  area: string;
  city: "lagos" | "abuja";
  kind: "place" | "visiting" | "remote";
  category: { code: string; name: string };
  /** The top of the catalogue it sits under, e.g. Beach & Water. Missing from venues saved by older versions. */
  section?: { code: string; name: string };
  night: boolean;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  /** For a service by phone or video: the number to call. */
  servicePhone: string | null;
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
  trip: Trip | null;
  createdAt: string;
  venue: { id: string; name: string; area: string; kind: "place" | "visiting" | "remote" } | null;
  offerName: string | null;
  /** The car and driver, once the concierge has confirmed. Missing in data saved by older versions. */
  vehicle?: { plate: string; makeModel: string; year: number | null; colour: string | null } | null;
  driver?: { name: string } | null;
}

/** A signed pass for this phone, kept so the QR works with no signal. */
export interface StoredPass {
  deviceId: string;
  certificate: string;
  expiresAt: string;
  backupCodes: { validOn: string; code: string }[];
}

/** An airport service's flight. */
export interface Trip {
  direction: "arrival" | "departure";
  flightNumber: string;
  time: string;
}

/** One benefit's page. */
export interface BenefitPage {
  benefit: Allowance;
  membership: { id: string; plan: { id: string; name: string }; startsOn: string; endsOn: string; status: Membership["status"] };
  covers: string[];
  rules: { oncePerVenuePerDay: boolean; oncePerVenuePerMonth: boolean; onePerPerson: boolean; sharedByCrew: boolean; topTierVenues: boolean };
  venues: { id: string; name: string; area: string; kind: "place" | "visiting" | "remote"; night: boolean; openNow: boolean; servicePhone: string | null; services: string[] }[];
  visits: { id: string; occurredAt: string; partySize: number; venue: { id: string; name: string; area: string }; service: string }[];
}

export type Currency = "NGN" | "GBP" | "USD";

/** A plan on sale, as the API offers it today. */
export interface PlanOffer {
  id: string;
  name: string;
  description: string | null;
  crewSize: number;
  startsOn: string;
  endsOn: string;
  /** A yearly pass that renews automatically. */
  renews: boolean;
  prices: { currency: Currency; amountMinor: number }[];
  benefits: { name: string; code: string; quantity: number | null; period: Allowance["period"] }[];
}

/** A payment, as a receipt. */
export interface Receipt {
  id: string;
  kind: "new" | "renewal";
  status: "pending" | "paid" | "failed" | "expired" | "refunded" | "partially_refunded";
  plan: { id: string; name: string };
  currency: Currency;
  amountMinor: number;
  paidAt: string | null;
  createdAt: string;
  membershipId: string | null;
  refundedMinor: number;
}

export interface Subscription {
  id: string;
  plan: { id: string; name: string };
  status: "active" | "past_due" | "cancelled";
  autoRenew: boolean;
  currency: Currency;
  amountMinor: number;
  currentMembershipId: string | null;
  lastFailureReason: string | null;
}

export interface CrewView {
  plan: { id: string; name: string; crewSize: number };
  isBuyer: boolean;
  seatsLeft: number;
  crew: { fullName: string; isMe: boolean }[];
  invites: { id: string; fullName: string; phone: string }[];
}

export interface CrewInvite {
  id: string;
  fullName: string;
  invitedBy: string;
  plan: string;
  startsOn: string;
  endsOn: string;
}
