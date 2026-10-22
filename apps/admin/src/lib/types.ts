import type { CostBasis, PlanCosting } from "@intu/rules";
// Shapes the admin API returns (dates as ISO strings).
export type Permission = "members.read" | "members.write" | "plans.read" | "plans.write" | "partners.read" | "partners.write" | "staff.manage" | "import.pilot" | "audit.read";
export type StaffRole = "founder" | "ops_lead" | "ops" | "concierge" | "finance" | "partnerships";

export interface Me {
  staff: { id: string; role: StaffRole; fullName: string; email: string | null };
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
}

export type OfferModel = "included" | "included_or_add_on" | "add_on" | "member_privilege";

export type WeeklyHours = Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", { open: string; close: string }[]>;

export interface Venue {
  id: string;
  partnerId: string;
  name: string;
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
