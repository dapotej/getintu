import type { CostBasis, PlanCosting } from "@intu/rules";
// Shapes the admin API returns (dates as ISO strings).
export type UsageMode = "door" | "booking" | "airport" | "call" | "concierge" | "in_app";
export type Permission = "members.read" | "members.write" | "plans.read" | "plans.write" | "partners.read" | "partners.write" | "staff.manage" | "import.pilot" | "audit.read" | "bookings.manage" | "clients.read" | "clients.write" | "clients.invoices" | "payments.read" | "payments.refund" | "settlements.read" | "settlements.write" | "settlements.pay";
export type StaffRole = "founder" | "ops_lead" | "ops" | "concierge" | "finance" | "partnerships";

export interface Me {
  staff: { id: string; role: StaffRole; fullName: string; email: string | null; canApprovePayouts: boolean };
  permissions: Permission[];
}

export interface Price {
  id: string;
  currency: "GBP" | "USD" | "NGN";
  amountMinor: number;
}

export type CategoryLevel = "category" | "subcategory" | "service";

export interface Category {
  id: string;
  code: string;
  parentId: string | null;
  level: CategoryLevel;
  name: string;
  sortOrder: number;
  customerVisible: boolean;
  active: boolean;
  /** How members use it; null means the same as the entry above. */
  usageMode: UsageMode | null;
}

/** One catalogue entry's page: who offers it and which plans include it. */
export interface CategoryDetail {
  category: Category;
  offers: {
    id: string;
    rateMinor: number;
    rateCurrency: "GBP" | "USD" | "NGN";
    retailMinor: number | null;
    offerModel: OfferModel;
    pricesArePlaceholders: boolean;
    active: boolean;
    service: { id: string; code: string; name: string };
    venue: { id: string; name: string; area: string; tier: "standard" | "top"; kind: "place" | "visiting" | "remote"; active: boolean };
    partner: { id: string; tradingName: string };
  }[];
  benefits: { id: string; quantity: number | null; period: "per_pass" | "per_month" | "per_year"; name: string; covers: "all" | "part"; plan: { id: string; name: string; active: boolean } }[];
}

/** The short form of a category embedded in other records. */
export interface CategoryRef {
  id?: string;
  code: string;
  name: string;
  level?: CategoryLevel;
}

export interface Benefit {
  id: string;
  planId: string;
  categoryId: string;
  category: CategoryRef;
  quantity: number | null;
  period: "per_pass" | "per_month" | "per_year";
  sharedByGroup: boolean;
  capOncePerVenuePerMonth: boolean;
  capOncePerVenuePerDay: boolean;
  drawPerPerson: boolean;
  allowedVenueTiers: ("standard" | "top")[];
  costBasis: CostBasis;
  plannedCostMinor: number | null;
  expectedUsePct: number;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  seasonStartsOn: string | null;
  seasonEndsOn: string | null;
  durationDays: number | null;
  onSaleFrom: string | null;
  onSaleTo: string | null;
  groupSize: number;
  overheadPerMemberMinor: number;
  active: boolean;
  isTest: boolean;
  prices: Price[];
  benefits?: Benefit[];
  /** On a single plan: what it costs to deliver and the margin at each price. */
  costing?: PlanCosting;
}

export interface FxRate {
  currency: "GBP" | "USD";
  koboPerUnit: number;
  updatedAt: string;
}

export interface Partner {
  id: string;
  legalName: string;
  tradingName: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  settlementTerms: string | null;
  active: boolean;
  isTest: boolean;
  hasBankDetails: boolean;
  payoutBankName: string | null;
  payoutAccountLast4: string | null;
  payoutAccountName: string | null;
  payoutRecipientCode: string | null;
}

export type OfferModel = "included" | "included_or_add_on" | "add_on" | "member_privilege";

export type WeeklyHours = Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", { open: string; close: string }[]>;

export interface Venue {
  id: string;
  partnerId: string;
  name: string;
  /** A place members visit, a service that comes to them (only used against a booking), or a service by phone or video. */
  kind: "place" | "visiting" | "remote";
  area: string;
  city: "lagos" | "abuja";
  /** A catalogue category or subcategory. */
  categoryId: string;
  tier: "standard" | "top";
  description: string | null;
  openingHours: WeeklyHours;
  capacityNotes: string | null;
  externalRef: string | null;
  active: boolean;
  isTest: boolean;
  latitude: number | null;
  longitude: number | null;
  /** The number members call, for a service by phone or video. */
  servicePhone: string | null;
}

export interface Offer {
  id: string;
  venueId: string;
  categoryId: string;
  category: CategoryRef;
  description: string | null;
  rateMinor: number;
  retailMinor: number | null;
  offerModel: OfferModel;
  pricesArePlaceholders: boolean;
  rateCurrency: "GBP" | "USD" | "NGN";
  validFrom: string | null;
  validTo: string | null;
  dailyCap: number | null;
  active: boolean;
}

export interface Member {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  country: string | null;
  consentMarketing: boolean;
  isTest: boolean;
  createdAt: string;
  /** A signed link to their photo, for an hour; absent on member lists. */
  photoUrl?: string | null;
}

export interface Allowance {
  id: string;
  category: CategoryRef;
  granted: number | null;
  used: number;
  periodStart: string;
  periodEnd: string;
  shared: boolean;
}

export interface Membership {
  id: string;
  status: "pending" | "active" | "suspended" | "ended" | "cancelled";
  startsOn: string;
  endsOn: string;
  arrivesOn: string | null;
  departsOn: string | null;
  paymentSource: "direct" | "client" | "gift";
  groupId: string | null;
  passNumber: string | null;
  plan: { id: string; name: string; code: string };
  /** The client paying for it, when paymentSource is client. */
  client?: { id: string; name: string } | null;
  allowances: Allowance[];
}

export interface Visit {
  id: string;
  occurredAt: string;
  serviceDate: string;
  venueName: string;
  category: CategoryRef;
  result: "approved" | "declined";
  reason: string | null;
  method: "online" | "offline" | "manual";
  partySize: number;
  /** Set when ops reversed the visit (it didn't happen); the allowance was given back. */
  reversedAt: string | null;
  /** The car the driver picked, at a chauffeur or transfer listing. */
  vehiclePlate?: string | null;
}

/** A car a chauffeur or transfer listing uses. */
export interface Vehicle {
  id: string;
  venueId: string;
  plate: string;
  makeModel: string;
  year: number | null;
  colour: string | null;
  active: boolean;
}

/** The car and driver assigned to a booking. */
export interface Assigned {
  vehicle: { id: string; plate: string; makeModel: string; year: number | null; colour: string | null } | null;
  driver: { id: string; fullName: string } | null;
}

export interface Booking {
  id: string;
  membershipId: string | null;
  bookingDate: string;
  partySize: number;
  status: "requested" | "confirmed" | "declined" | "cancelled" | "completed" | "no_show";
  notes: string | null;
  redemptionId: string | null;
  venue: { id: string; name: string; partnerId: string; kind: "place" | "visiting" | "remote" } | null;
  /** Airport services: the flight to meet. */
  trip?: { direction: "arrival" | "departure"; flightNumber: string; time: string } | null;
  offerName: string | null;
  vehicle?: Assigned["vehicle"];
  driver?: Assigned["driver"];
}

export interface MemberDetail {
  member: Member;
  memberships: Membership[];
  visits: Visit[];
}

export interface StaffUser {
  id: string;
  role: StaffRole;
  fullName: string;
  email: string | null;
  active: boolean;
  canApprovePayouts: boolean;
  createdAt: string;
}

export interface ImportIssue {
  file: string;
  line: number | null;
  message: string;
}

export interface ImportReport {
  dryRun: boolean;
  committed: boolean;
  counts: Record<string, { created: number; existing: number; updated?: number }>;
  warnings: ImportIssue[];
  errors: ImportIssue[];
  notImported: string[];
}

/** A booking in the concierge's queue. */
export interface QueuedBooking {
  id: string;
  bookingDate: string;
  partySize: number;
  status: "requested" | "confirmed";
  notes: string | null;
  createdAt: string;
  member: { id: string; fullName: string; phone: string };
  venue: { id: string; name: string; partnerId: string; kind: "place" | "visiting" | "remote" } | null;
  /** Airport services: the flight to meet. */
  trip?: { direction: "arrival" | "departure"; flightNumber: string; time: string } | null;
  offerName: string | null;
  vehicle?: Assigned["vehicle"];
  driver?: Assigned["driver"];
}

/** A company or bank buying passes for others (banks and fintechs first). */
export interface Client {
  id: string;
  name: string;
  kind: "bank" | "employer" | "promoter";
  contractRef: string | null;
  contractStartsOn: string | null;
  contractEndsOn: string | null;
  /** The most passes the contract allows; null for no limit. */
  seats: number | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  billingEmail: string | null;
  notes: string | null;
  active: boolean;
  isTest: boolean;
  seatsSetUp?: number;
  seatsAssigned?: number;
}

/** One pass a client pays for; open until someone holds it. */
export interface ClientSeat {
  id: string;
  startsOn: string;
  endsOn: string;
  customerRef: string | null;
  assignedAt: string | null;
  plan: { id: string; name: string };
  membership: { id: string; status: string; startsOn: string; endsOn: string } | null;
  member: { id: string; fullName: string; phone: string } | null;
}

export interface ClientInvoice {
  id: string;
  number: string;
  issuedOn: string;
  dueOn: string | null;
  amountMinor: number;
  currency: "GBP" | "USD" | "NGN";
  status: "issued" | "paid" | "void";
  paidOn: string | null;
  note: string | null;
}

export interface ClientDetail {
  client: Client;
  seats: ClientSeat[];
  invoices: ClientInvoice[];
  usage: {
    seats: { total: number; assigned: number; open: number; limit: number | null };
    visits: number;
    visitsThisMonth: number;
    peopleThisMonth: number;
    byService: { name: string; visits: number; thisMonth: number }[];
  };
}

export interface Refund {
  id: string;
  orderId: string;
  amountMinor: number;
  currency: "GBP" | "USD" | "NGN";
  reason: string;
  endsPass: boolean;
  status: "awaiting_approval" | "rejected" | "processing" | "succeeded" | "failed";
  requestedBy: string;
  decidedBy?: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  failureReason: string | null;
  createdAt: string;
}

/** A payment for a pass, with its refunds. */
export interface Order {
  id: string;
  kind: "new" | "renewal";
  status: "pending" | "paid" | "failed" | "expired" | "refunded" | "partially_refunded";
  currency: "GBP" | "USD" | "NGN";
  amountMinor: number;
  provider: "stripe" | "paystack" | "test";
  providerRef: string | null;
  paidAt: string | null;
  failureReason: string | null;
  membershipId: string | null;
  isTest: boolean;
  createdAt: string;
  member: { id: string; fullName: string; phone: string };
  plan: { id: string; name: string };
  /** What can still be refunded, in minor units. */
  refundable: number;
  refunds: Refund[];
}

export interface PaymentsOverview {
  orders: Order[];
  totals: { currency: "GBP" | "USD" | "NGN"; paid: number; paidThisMonth: number; count: number; refunded: number }[];
  /** The same for TEST payments, which the real totals leave out. */
  testTotals: PaymentsOverview["totals"];
  failedRenewals: { id: string; member: { id: string; fullName: string; phone: string }; plan: { id: string; name: string }; currency: "GBP" | "USD" | "NGN"; amountMinor: number; failedAt: string | null; reason: string | null }[];
  approvalOver: Record<"GBP" | "USD" | "NGN", number>;
}

export interface RefundToApprove extends Refund {
  order: { id: string; amountMinor: number; currency: "GBP" | "USD" | "NGN"; paidAt: string | null };
  member: { id: string; fullName: string };
  plan: { name: string };
}

export type SettlementStatus = "draft" | "approved" | "paying" | "paid" | "failed" | "void";

export interface Settlement {
  id: string;
  partnerId: string;
  periodStart: string;
  periodEnd: string;
  totalMinor: number;
  linesMinor: number;
  lineCount: number;
  currency: "NGN";
  status: SettlementStatus;
  changedById: string | null;
  changedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  transferReference: string | null;
  transferAttempts: number;
  failureReason: string | null;
  voidReason: string | null;
  isTest: boolean;
}

export interface SettlementRow extends Settlement {
  partner: { id: string; tradingName: string };
}

export interface SettlementLine {
  id: string;
  occurredAt: string;
  serviceDate: string;
  partySize: number;
  method: "online" | "offline" | "manual";
  flagged: boolean;
  amountMinor: number;
  venue: string;
  service: string;
  member: string;
}

export interface SettlementDetail {
  settlement: Settlement & { paidBy: string | null };
  partner: { id: string; tradingName: string; legalName: string; payoutAccount: PayoutAccount | null };
  lines: SettlementLine[];
  adjustments: { id: string; amountMinor: number; reason: string; createdAt: string; createdBy: string }[];
  held: { id: string; serviceDate: string; reason: string; venue: string; service: string; member: string }[];
  canApprove: { ok: boolean; reason?: string; message?: string };
  canPay: { ok: boolean; reason?: string; message?: string };
}

export interface PayoutAccount {
  bankName: string | null;
  accountLast4: string | null;
  accountName: string | null;
}
