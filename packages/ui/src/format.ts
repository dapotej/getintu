// Display helpers. Money arrives as integer minor units and is only formatted here, at the edge.

const MINOR_PER_MAJOR: Record<string, number> = { GBP: 100, USD: 100, NGN: 100 };

export function formatMoney(amountMinor: number, currency: string): string {
  const divisor = MINOR_PER_MAJOR[currency] ?? 100;
  const major = Math.trunc(amountMinor / divisor);
  const minor = Math.abs(amountMinor % divisor);
  const fmt = new Intl.NumberFormat("en-GB", { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: minor ? 2 : 0, maximumFractionDigits: 2 });
  // Intl formats a decimal string exactly, so the amount never passes through a float.
  const sign = amountMinor < 0 && major === 0 ? "-" : "";
  return fmt.format(`${sign}${major}.${String(minor).padStart(2, "0")}` as `${number}`);
}

/** "18000" or "18,000.50" (major units, as typed) → minor units, or null if it isn't an amount. */
export function parseMajorToMinor(input: string): number | null {
  const m = /^\s*(\d{1,12})(?:\.(\d{1,2}))?\s*$/.exec(input.replace(/,/g, ""));
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

/** Minor units → the plain major-unit string an input field should show ("18000", "149.99"). */
export function minorToMajorInput(amountMinor: number): string {
  const major = Math.trunc(amountMinor / 100);
  const minor = amountMinor % 100;
  return minor ? `${major}.${String(minor).padStart(2, "0")}` : String(major);
}

const lagosDateTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" });
const lagosDate = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", dateStyle: "medium" });

/** A timestamp in Lagos time, e.g. "12 Dec 2026, 21:04". */
export const formatLagosDateTime = (iso: string) => lagosDateTime.format(new Date(iso));
/** A calendar date (YYYY-MM-DD) as "12 Dec 2026". */
export const formatDate = (date: string) => lagosDate.format(new Date(`${date}T00:00:00Z`));

export const BENEFIT_LABELS: Record<string, string> = {
  beach_club: "Beach club",
  pool_gym: "Pool and gym",
  golf: "Golf",
  spa: "Spa",
  hosted_night: "Hosted night",
  lounge: "Departure lounge",
  meet_assist: "Meet and assist",
  guest_list: "Guest list",
  priority_dining: "Priority dining",
  partner_meal: "Partner meal",
  club_visit: "Club visit",
  esim_data: "Travel eSIM",
};

/** Day benefits show amber, night benefits teal. */
export const NIGHT_BENEFITS = new Set(["guest_list", "hosted_night"]);

export const DECLINE_LABELS: Record<string, string> = {
  MEMBERSHIP_NOT_ACTIVE: "Pass not active",
  OUTSIDE_MEMBERSHIP_DATES: "Outside pass dates",
  VENUE_INACTIVE: "Venue not active",
  VENUE_CLOSED: "Venue closed",
  OFFER_NOT_VALID_NOW: "Offer not valid now",
  BENEFIT_NOT_IN_PLAN: "Not in this plan",
  VENUE_TIER_NOT_ALLOWED: "Venue tier not included",
  ALLOWANCE_USED_UP: "Used up",
  VENUE_MONTHLY_CAP: "Already used here this month",
  VENUE_DAILY_LIMIT: "Already used here today",
  OFFER_DAILY_CAP: "Venue's daily limit reached",
  DUPLICATE_SCAN: "Already claimed",
};
