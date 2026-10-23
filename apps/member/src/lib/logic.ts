// The app's small decisions, kept free of React Native so they're unit-tested. None of them is an
// entitlement decision: the API and the scan decide what a member may use.
import type { Allowance, BenefitPage, Booking, BookingStatus, Hours, Membership, StoredPass, Trip, UsageMode, Venue } from "./types";

/** Lagos has no daylight saving: it's always UTC+1. */
export const lagosDate = (now: Date) => new Date(now.getTime() + 3_600_000).toISOString().slice(0, 10);

/** The pass to show: an active one valid today, else the next active one to start, else the latest. */
export function currentPass(memberships: readonly Membership[], now: Date): Membership | null {
  const today = lagosDate(now);
  const active = memberships.filter((m) => m.status === "active");
  return (
    active.find((m) => m.startsOn <= today && m.endsOn >= today) ??
    [...active].filter((m) => m.startsOn > today).sort((a, b) => a.startsOn.localeCompare(b.startsOn))[0] ??
    memberships[0] ??
    null
  );
}

/** The pass is renewed whenever there's signal and it has less than this left, so it always lasts a day offline. */
export const RENEW_BELOW_MS = 30 * 3_600_000;

export function needsRenewal(pass: StoredPass | null, now: Date): boolean {
  return !pass || new Date(pass.expiresAt).getTime() - now.getTime() < RENEW_BELOW_MS;
}

/** Whether a stored pass can still make codes a scanner accepts. */
export const passUsable = (pass: StoredPass | null, now: Date) => pass !== null && new Date(pass.expiresAt).getTime() > now.getTime();

/** Today's backup code, if the stored pass has one. */
export const backupCodeFor = (pass: StoredPass | null, now: Date) => pass?.backupCodes.find((c) => c.validOn === lagosDate(now))?.code ?? null;

/** "3 of 4 left", "Unlimited", "Used up". */
export function allowanceLabel(a: Pick<Allowance, "granted" | "remaining">): string {
  if (a.granted === null) return "Unlimited";
  if (a.remaining === 0) return "Used up";
  return `${a.remaining} of ${a.granted} left`;
}

const PERIOD_RESET: Record<Allowance["period"], string> = { per_pass: "For the whole pass", per_month: "Resets monthly", per_year: "Resets yearly" };
export const periodLabel = (a: Pick<Allowance, "period" | "periodEnd">) => (a.period === "per_pass" ? PERIOD_RESET.per_pass : `${PERIOD_RESET[a.period]} · until ${formatDate(a.periodEnd)}`);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "14 Dec 2026", or "Sat 14 Dec" with { weekday: true, year: false }. */
export function formatDate(date: string, opts: { weekday?: boolean; year?: boolean } = {}) {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const parts = [opts.weekday ? DAYS[day.getUTCDay()] : null, String(d), MONTHS[(m ?? 1) - 1], opts.year === false ? null : String(y)];
  return parts.filter(Boolean).join(" ");
}

/** A visit's time in Lagos, e.g. "14 Dec, 21:40". */
export function formatLagosTime(iso: string) {
  const lagos = new Date(new Date(iso).getTime() + 3_600_000).toISOString();
  return `${formatDate(lagos.slice(0, 10), { year: false })}, ${lagos.slice(11, 16)}`;
}

/** Today's opening hours in Lagos: "10:00–19:00", "Open all day" or "Closed today". */
export function hoursToday(hours: Hours, now: Date): string {
  const day = String(new Date(now.getTime() + 3_600_000).getUTCDay()) as keyof Hours;
  const w = hours[day]?.[0];
  if (!w) return "Closed today";
  if (w.open === "00:00" && w.close === "24:00") return "Open all day";
  return `${w.open}–${w.close}`;
}

/** Dates someone can ask to book: from today (or the pass start) to the pass end, at most `max`. */
export function bookableDates(m: Pick<Membership, "startsOn" | "endsOn">, now: Date, max = 21): string[] {
  const start = [lagosDate(now), m.startsOn].sort().at(-1) ?? m.startsOn;
  const out: string[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); out.length < max; t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    if (date > m.endsOn) break;
    out.push(date);
  }
  return out;
}

export const BOOKING_STATUS: Record<BookingStatus, { label: string; tone: "day" | "night" | "pop" | "muted" }> = {
  requested: { label: "Requested", tone: "day" },
  confirmed: { label: "Confirmed", tone: "night" },
  declined: { label: "Not available", tone: "pop" },
  cancelled: { label: "Cancelled", tone: "muted" },
  completed: { label: "Done", tone: "muted" },
  no_show: { label: "Missed", tone: "pop" },
};

/** The concierge chat, opened in WhatsApp with who's asking already filled in. */
export function whatsappLink(number: string, who: { fullName: string; passNumber: string | null }) {
  const text = `Hi intu, it's ${who.fullName}${who.passNumber ? ` (pass ${who.passNumber})` : ""}. `;
  return `https://wa.me/${number.replace(/\D/g, "")}?text=${encodeURIComponent(text)}`;
}

/** Normalises a phone number as typed into E.164: "+44 7700 900123" → "+447700900123". */
export function toE164(typed: string): string | null {
  const digits = typed.replace(/[\s()-]/g, "");
  const e164 = digits.startsWith("00") ? `+${digits.slice(2)}` : digits;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

export interface DiscoverFilters {
  side: "all" | "day" | "night";
  includedOnly: boolean;
  search: string;
}

/**
 * Discover's rows: venues grouped under the top of the catalogue (Beach & Water, Nightlife…), in
 * catalogue order, after the filters. A search matches the venue, its area or its kind of place.
 */
export function discoverSections<V extends { name: string; area: string; night: boolean; included: boolean; category: { code: string; name: string }; section?: { code: string; name: string } }>(venues: readonly V[], f: DiscoverFilters) {
  const words = f.search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  // Venues saved on the phone before the API sent sections are grouped by their own category.
  const sectionOf = (v: V) => v.section ?? { code: v.category.code.split("-")[0] ?? v.category.code, name: v.category.name };
  const shown = venues.filter((v) => {
    if (f.side !== "all" && (f.side === "night") !== v.night) return false;
    if (f.includedOnly && !v.included) return false;
    const text = `${v.name} ${v.area} ${v.category.name} ${sectionOf(v).name}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
  const sections = new Map<string, { section: { code: string; name: string }; venues: V[] }>();
  for (const v of shown) {
    const section = sectionOf(v);
    const row = sections.get(section.code) ?? { section, venues: [] as V[] };
    row.venues.push(v);
    sections.set(section.code, row);
  }
  // Within a row, what the plan includes first, then by name.
  return [...sections.values()]
    .sort((a, b) => a.section.code.localeCompare(b.section.code))
    .map((row) => ({ ...row, venues: row.venues.sort((a, b) => Number(b.included) - Number(a.included) || a.name.localeCompare(b.name)) }));
}

/** How to use a benefit, in a line, by how it's used. */
export const HOW_TO_USE: Record<UsageMode, string> = {
  door: "Show your pass at the door. The venue scans it, and it's counted here.",
  booking: "Book it ahead and the concierge confirms it with the venue or provider. On the day, show your pass.",
  airport: "Request it with your flight. We confirm with the airport team; on the day, show your pass.",
  call: "Call any time, day or night. Calls aren't counted.",
  concierge: "Message the concierge and they'll arrange it for you.",
  in_app: "Coming soon in the app.",
};

/** A benefit's rules in plain words. */
export function ruleLines(r: BenefitPage["rules"]): string[] {
  return [
    r.oncePerVenuePerDay ? "Once per venue per day" : null,
    r.oncePerVenuePerMonth ? "Once per venue per month" : null,
    r.onePerPerson ? "Each person in your party uses one" : null,
    r.sharedByCrew ? "Shared by everyone in your Crew" : null,
    r.topTierVenues ? "Includes top-tier venues" : null,
  ].filter((l): l is string => l !== null);
}

/** "Black Toyota Land Cruiser · LND 123 AB". */
export const vehicleText = (v: Booking["vehicle"]) => (v ? `${[v.colour, v.makeModel].filter(Boolean).join(" ")} · ${v.plate}` : null);

/** "Arriving on BA75 at 15:20". */
export const tripText = (t: Trip | null) => (t ? `${t.direction === "arrival" ? "Arriving" : "Departing"} on ${t.flightNumber} at ${t.time}` : null);

/** Whether a booking at a venue needs flight details: the chosen offer, or every bookable offer, is an airport service. */
export function needsFlight(offers: readonly { id: string; usageMode: UsageMode; booked: boolean }[], offerId: string | null): boolean {
  const asked = offerId ? offers.filter((o) => o.id === offerId) : offers.filter((o) => o.booked);
  return asked.length > 0 && asked.every((o) => o.usageMode === "airport");
}

/** A line under each of a venue's offers saying how it's used. */
export const OFFER_HINT: Record<UsageMode, string> = {
  door: "Show your pass at the door",
  booking: "Book ahead",
  airport: "Request it with your flight",
  call: "Call any time",
  concierge: "Through the concierge",
  in_app: "In the app",
};

/**
 * What a venue page offers to do: show the pass for entry, call a service line, book the offers
 * that are booked ahead (only those), or message the concierge.
 */
export function venueActions(v: { kind: Venue["kind"]; servicePhone: string | null; offers: readonly { usageMode: UsageMode; booked: boolean; included: boolean }[] }) {
  const booked = v.offers.filter((o) => o.booked);
  return {
    showPass: v.kind !== "remote" && v.offers.some((o) => o.usageMode === "door" && o.included),
    call: v.servicePhone && (v.kind === "remote" || v.offers.some((o) => o.usageMode === "call")) && v.offers.some((o) => o.included) ? v.servicePhone : null,
    book: booked.length === 0 ? null : booked.every((o) => o.usageMode === "airport") ? "Request it with your flight" : "Book ahead",
    concierge: v.offers.some((o) => o.usageMode === "concierge"),
  };
}
