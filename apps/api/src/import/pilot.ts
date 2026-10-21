// Imports the December 2026 pilot Google Sheet (exported tab by tab as CSV) so pilot members keep
// their history. Runs in one transaction: a dry run, or any error, rolls everything back and
// returns the report. Safe to run again: rows already imported are recognised and skipped.
import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, isNull, lte, or } from "drizzle-orm";
import { audit, grantAllowances, one, schema, type Db, type Tx } from "@intu/db";
import { serviceDate, type BenefitType, type DeclineReason, type WeeklyHours } from "@intu/rules";
import { readTable } from "./csv.ts";
import { parseDate, parseLagosTimestamp, type DateOrder } from "./dates.ts";

const { partners, venues, offers, members, memberships, plans, benefits, allowances, redemptions, bookings } = schema;

export interface PilotFiles {
  partners?: string | undefined;
  members?: string | undefined;
  allowances?: string | undefined;
  visits?: string | undefined;
  bookings?: string | undefined;
}

export interface PilotImportInput {
  files: PilotFiles;
  /** Pilot tier name (as written in the sheet's tier column) → plan id. */
  tierPlans: Record<string, string>;
  /** How the sheet writes dates when they aren't ISO. */
  dateOrder: DateOrder;
  dryRun: boolean;
  actor: { type: "staff" | "system"; id?: string };
}

type FileName = keyof PilotFiles;
export interface Issue {
  file: FileName;
  line: number | null;
  message: string;
}

export interface PilotImportReport {
  dryRun: boolean;
  committed: boolean;
  counts: Record<string, { created: number; existing: number; updated?: number }>;
  warnings: Issue[];
  errors: Issue[];
  notImported: string[];
}

class Rollback extends Error {}

// Column aliases per tab, from the pilot spec's Data section.
const PARTNER_COLUMNS = {
  venueId: ["venue id", "id"],
  name: ["venue", "venue name"],
  area: [],
  benefits: ["benefit(s) offered", "benefits offered", "benefit", "benefit(s)"],
  rate: ["rate per visit (₦)", "rate per visit", "rate", "rate (₦)", "rate ngn"],
  contact: [],
  bankRef: ["bank details reference", "bank details", "bank ref"],
  active: [],
} as const;
const MEMBER_COLUMNS = {
  passNumber: ["pass number", "pass no", "pass"],
  token: [],
  tier: ["pass tier", "plan"],
  name: ["full name", "member name"],
  email: [],
  phone: ["whatsapp", "whatsapp number", "phone number", "mobile"],
  photo: ["photo link", "photo url"],
  arrival: ["arrival date", "arrives"],
  departure: ["departure date", "departs"],
  status: [],
  crewGroup: ["crew group id", "crew group", "group id"],
} as const;
const ALLOWANCE_COLUMNS = { passNumber: ["pass number", "pass"], benefit: [], total: ["granted"], used: [], remaining: ["left"] } as const;
const VISIT_COLUMNS = {
  timestamp: ["time", "date and time", "scanned at"],
  passNumber: ["pass number", "pass"],
  venueId: ["venue id", "venue"],
  benefit: [],
  result: ["outcome", "result (approved / declined + reason)"],
  method: [],
  note: ["staff note", "notes"],
} as const;
const BOOKING_COLUMNS = { passNumber: ["pass number", "pass"], venue: ["venue or event", "event", "venue / event"], date: [], benefit: ["benefit used", "benefit used (if any)"], status: [] } as const;

const BENEFIT_NAMES: Record<string, BenefitType> = {
  beach: "beach_club",
  beachclub: "beach_club",
  beachclubdaypass: "beach_club",
  poolandgym: "pool_gym",
  poolgym: "pool_gym",
  pool: "pool_gym",
  gym: "pool_gym",
  golf: "golf",
  golfroundorlesson: "golf",
  spa: "spa",
  spatreatment: "spa",
  hostednight: "hosted_night",
  lounge: "lounge",
  departurelounge: "lounge",
  meetandassist: "meet_assist",
  meetassist: "meet_assist",
  airport: "meet_assist",
  guestlist: "guest_list",
  nightlife: "guest_list",
  prioritydining: "priority_dining",
  restaurant: "priority_dining",
};
const key = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
export const benefitFromSheet = (s: string): BenefitType | null => BENEFIT_NAMES[key(s)] ?? null;

const CATEGORY_FOR: Partial<Record<BenefitType, (typeof venues.$inferInsert)["category"]>> = {
  beach_club: "beach_club",
  pool_gym: "hotel",
  golf: "golf",
  spa: "spa",
  hosted_night: "members_club",
  lounge: "lounge",
  guest_list: "nightclub",
  priority_dining: "restaurant",
};

const ALL_DAY: WeeklyHours = Object.fromEntries(["0", "1", "2", "3", "4", "5", "6"].map((d) => [d, [{ open: "00:00", close: "24:00" }]])) as WeeklyHours;

/** "₦18,000", "18000", "18,000.50" → kobo, without ever going through a float. */
export function nairaToKobo(raw: string): number | null {
  const s = raw.replace(/[₦,\s]|NGN/gi, "");
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

export function normalisePhone(raw: string): string | null {
  let s = raw.replace(/[\s\-().]/g, "");
  if (s.startsWith("00")) s = `+${s.slice(2)}`;
  return /^\+[1-9]\d{6,14}$/.test(s) ? s : null;
}

const truthy = (s: string) => ["true", "yes", "y", "1", "active"].includes(s.trim().toLowerCase());

/** The same Crew group id every run, so re-imports land in the same group. */
export function groupUuid(pilotGroupId: string): string {
  const h = createHash("sha256").update(`intu-pilot-crew:${pilotGroupId.trim().toLowerCase()}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

function declineFromSheet(text: string): DeclineReason | null {
  const t = text.toLowerCase();
  if (t.includes("used up") || t.includes("none left") || t.includes("no allowance")) return "ALLOWANCE_USED_UP";
  if (t.includes("not active") || t.includes("suspended")) return "MEMBERSHIP_NOT_ACTIVE";
  if (t.includes("outside dates") || t.includes("expired") || t.includes("outside")) return "OUTSIDE_MEMBERSHIP_DATES";
  if (t.includes("same day") || t.includes("already")) return "VENUE_DAILY_LIMIT";
  return null;
}

const BOOKING_STATUS: Record<string, (typeof bookings.$inferInsert)["status"]> = {
  "": "requested",
  requested: "requested",
  pending: "requested",
  confirmed: "confirmed",
  booked: "confirmed",
  cancelled: "cancelled",
  canceled: "cancelled",
  declined: "declined",
  completed: "completed",
  attended: "completed",
  done: "completed",
  noshow: "no_show",
};

export async function importPilot(db: Db, input: PilotImportInput): Promise<PilotImportReport> {
  const report: PilotImportReport = {
    dryRun: input.dryRun,
    committed: false,
    counts: {},
    warnings: [],
    errors: [],
    notImported: [],
  };
  const count = (name: string, kind: "created" | "existing" | "updated") => {
    const c = (report.counts[name] ??= { created: 0, existing: 0 });
    c[kind] = (c[kind] ?? 0) + 1;
  };
  const warn = (file: FileName, line: number | null, message: string) => report.warnings.push({ file, line, message });
  const error = (file: FileName, line: number | null, message: string) => report.errors.push({ file, line, message });

  try {
    await db.transaction(async (tx) => {
      await importPartners(tx);
      const passToMembership = await importMembers(tx);
      await importAllowances(tx, passToMembership);
      await importVisits(tx, passToMembership);
      await importBookings(tx, passToMembership);
      if (input.dryRun || report.errors.length) throw new Rollback();
    });
    report.committed = true;
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }
  return report;

  // --- Partners tab: one row per venue; each becomes a partner, a venue and its offers. ---
  async function importPartners(tx: Tx) {
    const text = input.files.partners;
    if (!text) return;
    const t = readTable(text, PARTNER_COLUMNS, ["venueId", "name", "benefits", "rate"]);
    if (t.missing.length) return error("partners", 1, `Missing columns: ${t.missing.join(", ")}`);
    if (t.ignored.length) warn("partners", 1, `Columns not imported: ${t.ignored.join(", ")}`);

    for (const r of t.records) {
      const ref = r.get("venueId");
      const name = r.get("name");
      const types = r
        .get("benefits")
        .split(/[,;/\n]| and (?=[a-z])/i)
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => ({ raw: s, type: benefitFromSheet(s) }));
      const unknown = types.filter((x) => !x.type).map((x) => x.raw);
      if (unknown.length) warn("partners", r.line, `Benefits not recognised, skipped: ${unknown.join(", ")}`);
      const known = [...new Set(types.flatMap((x) => (x.type ? [x.type] : [])))];
      const rate = nairaToKobo(r.get("rate"));
      if (!ref || !name) {
        error("partners", r.line, "Venue ID and name are required");
        continue;
      }
      if (rate === null) {
        error("partners", r.line, `Rate "${r.get("rate")}" isn't a naira amount`);
        continue;
      }
      if (!known.length) {
        error("partners", r.line, "No recognised benefits for this venue");
        continue;
      }

      let [venue] = await tx.select().from(venues).where(eq(venues.externalRef, ref));
      if (venue) {
        count("venues", "existing");
      } else {
        const partner = one(await tx
          .insert(partners)
          .values({ legalName: name, tradingName: name, contactName: r.get("contact") || null, settlementTerms: r.get("bankRef") ? `Pilot bank reference: ${r.get("bankRef")}` : null, active: r.get("active") ? truthy(r.get("active")) : true })
          .returning());
        await audit(tx, input.actor, { action: "partner.imported", entity: "partner", entityId: partner.id, after: partner });
        count("partners", "created");
        venue = one(await tx
          .insert(venues)
          .values({ partnerId: partner.id, name, area: r.get("area") || "Lagos", city: "lagos", category: CATEGORY_FOR[known[0] as BenefitType] ?? "hotel", openingHours: ALL_DAY, externalRef: ref, active: partner.active })
          .returning());
        await audit(tx, input.actor, { action: "venue.imported", entity: "venue", entityId: venue.id, after: venue });
        count("venues", "created");
        warn("partners", r.line, `${name}: set the legal name, category and opening hours in the admin console (imported as open all day)`);
      }
      for (const benefitType of known) {
        const [existing] = await tx.select({ id: offers.id }).from(offers).where(and(eq(offers.venueId, venue.id), eq(offers.benefitType, benefitType)));
        if (existing) {
          count("offers", "existing");
          continue;
        }
        const offer = one(await tx.insert(offers).values({ venueId: venue.id, benefitType, rateMinor: rate, rateCurrency: "NGN" }).returning());
        await audit(tx, input.actor, { action: "offer.imported", entity: "offer", entityId: offer.id, after: offer });
        count("offers", "created");
      }
    }
  }

  // --- Members tab: one row per paid pass holder. ---
  async function importMembers(tx: Tx) {
    const passToMembership = new Map<string, typeof memberships.$inferSelect>();
    const text = input.files.members;
    if (text) {
      const t = readTable(text, MEMBER_COLUMNS, ["passNumber", "tier", "name", "phone", "status"]);
      if (t.missing.length) {
        error("members", 1, `Missing columns: ${t.missing.join(", ")}`);
      } else {
        if (t.ignored.length) warn("members", 1, `Columns not imported: ${t.ignored.join(", ")}`);
        const tierPlans = new Map(Object.entries(input.tierPlans).map(([k, v]) => [key(k), v]));
        const planRows = tierPlans.size ? await tx.select().from(plans).where(inArray(plans.id, [...tierPlans.values()])) : [];
        let photos = 0;
        let tokens = 0;

        for (const r of t.records) {
          const pass = r.get("passNumber").toUpperCase();
          const planId = tierPlans.get(key(r.get("tier")));
          const plan = planRows.find((p) => p.id === planId);
          const phone = normalisePhone(r.get("phone"));
          const status = ({ active: "active", suspended: "suspended", ended: "ended" } as const)[r.get("status").toLowerCase() as "active"];
          const arrives = r.get("arrival") ? parseDate(r.get("arrival"), input.dateOrder) : null;
          const departs = r.get("departure") ? parseDate(r.get("departure"), input.dateOrder) : null;

          if (!pass) error("members", r.line, "Pass number is missing");
          else if (!plan) error("members", r.line, `No plan chosen for tier "${r.get("tier")}"`);
          else if (!plan.seasonStartsOn || !plan.seasonEndsOn) error("members", r.line, `Plan ${plan.name} has no season dates`);
          else if (!phone) error("members", r.line, `WhatsApp number "${r.get("phone")}" needs a country code, e.g. +44…`);
          else if (!status) error("members", r.line, `Status "${r.get("status")}" should be Active, Suspended or Ended`);
          else if (r.get("arrival") && !arrives) error("members", r.line, `Arrival date "${r.get("arrival")}" isn't a date (${input.dateOrder})`);
          else if (r.get("departure") && !departs) error("members", r.line, `Departure date "${r.get("departure")}" isn't a date (${input.dateOrder})`);
          if (!pass || !plan?.seasonStartsOn || !plan.seasonEndsOn || !phone || !status || (r.get("arrival") && !arrives) || (r.get("departure") && !departs)) continue;

          if (r.get("photo")) photos++;
          if (r.get("token")) tokens++;

          const [existingMembership] = await tx.select().from(memberships).where(eq(memberships.passNumber, pass));
          if (existingMembership) {
            count("memberships", "existing");
            passToMembership.set(pass, existingMembership);
            continue;
          }

          let [member] = await tx.select().from(members).where(eq(members.phone, phone));
          if (member) {
            count("members", "existing");
          } else {
            member = one(await tx.insert(members).values({ fullName: r.get("name"), phone, email: r.get("email") || null }).returning());
            await audit(tx, input.actor, { action: "member.imported", entity: "member", entityId: member.id, after: member });
            count("members", "created");
          }

          const crew = r.get("crewGroup");
          if (plan.groupSize > 1 && !crew) warn("members", r.line, `${pass} is on a group plan but has no Crew group ID`);
          const membership = one(await tx
            .insert(memberships)
            .values({
              memberId: member.id,
              planId: plan.id,
              startsOn: plan.seasonStartsOn,
              endsOn: plan.seasonEndsOn,
              arrivesOn: arrives,
              departsOn: departs,
              status,
              paymentSource: "direct",
              groupId: crew ? groupUuid(crew) : null,
              passNumber: pass,
            })
            .returning());
          await audit(tx, input.actor, { action: "membership.imported", entity: "membership", entityId: membership.id, after: membership });
          await grantAllowances(tx, membership.id, input.actor);
          count("memberships", "created");
          passToMembership.set(pass, membership);
        }
        if (photos) report.notImported.push(`${photos} member photo links: photos are retaken in the member app at sign-up (milestone 5)`);
        if (tokens) report.notImported.push(`${tokens} pilot QR tokens: the app issues rotating codes instead`);
      }
    }
    return {
      async get(pass: string) {
        const p = pass.toUpperCase();
        if (!passToMembership.has(p)) {
          const [m] = await tx.select().from(memberships).where(eq(memberships.passNumber, p));
          if (m) passToMembership.set(p, m);
        }
        return passToMembership.get(p) ?? null;
      },
    };
  }

  type Passes = Awaited<ReturnType<typeof importMembers>>;

  async function allowanceFor(tx: Tx, membership: typeof memberships.$inferSelect, type: BenefitType, onDate?: string) {
    const [benefit] = await tx.select().from(benefits).where(and(eq(benefits.planId, membership.planId), eq(benefits.type, type)));
    if (!benefit) return { benefit: null, allowance: null };
    const shared = benefit.sharedByGroup && membership.groupId !== null;
    const [allowance] = await tx
      .select()
      .from(allowances)
      .where(
        and(
          eq(allowances.benefitId, benefit.id),
          shared ? eq(allowances.groupId, membership.groupId ?? "") : eq(allowances.membershipId, membership.id),
          onDate ? lte(allowances.periodStart, onDate) : undefined,
          onDate ? gte(allowances.periodEnd, onDate) : undefined,
        ),
      )
      .orderBy(desc(allowances.periodStart));
    return { benefit, allowance: allowance ?? null };
  }

  // --- Allowances tab: member × benefit totals and use. The sheet's counts are the truth. ---
  async function importAllowances(tx: Tx, passes: Passes) {
    const text = input.files.allowances;
    if (!text) return;
    const t = readTable(text, ALLOWANCE_COLUMNS, ["passNumber", "benefit", "total", "used"]);
    if (t.missing.length) return error("allowances", 1, `Missing columns: ${t.missing.join(", ")}`);

    // Crew-shared allowances appear once per member in the sheet; combine them first.
    const pending = new Map<string, { allowance: typeof allowances.$inferSelect; total: number; used: number; lines: number[]; shared: boolean; planQuantity: number | null }>();
    for (const r of t.records) {
      const membership = await passes.get(r.get("passNumber"));
      const type = benefitFromSheet(r.get("benefit"));
      const total = Number(r.get("total"));
      const used = Number(r.get("used"));
      if (!membership) {
        error("allowances", r.line, `Pass ${r.get("passNumber")} isn't in the Members tab or the database`);
        continue;
      }
      if (!type) {
        error("allowances", r.line, `Benefit "${r.get("benefit")}" not recognised`);
        continue;
      }
      if (!Number.isInteger(total) || !Number.isInteger(used) || total < 0 || used < 0) {
        error("allowances", r.line, "Total and used must be whole numbers");
        continue;
      }
      if (r.get("remaining") && Number(r.get("remaining")) !== total - used) warn("allowances", r.line, `Remaining (${r.get("remaining")}) doesn't equal total − used (${total - used}); used total and used`);
      const { benefit, allowance } = await allowanceFor(tx, membership, type);
      if (!benefit || !allowance) {
        error("allowances", r.line, `${membership.passNumber}'s plan has no ${type} benefit`);
        continue;
      }
      const shared = allowance.groupId !== null;
      const entry = pending.get(allowance.id);
      if (entry && !shared) {
        error("allowances", r.line, `${membership.passNumber} has more than one ${type} row`);
        continue;
      }
      if (entry) {
        entry.total = Math.max(entry.total, total);
        entry.used += used;
        entry.lines.push(r.line);
      } else {
        pending.set(allowance.id, { allowance, total, used, lines: [r.line], shared, planQuantity: benefit.quantity });
      }
    }

    for (const p of pending.values()) {
      const line = p.lines[0] ?? null;
      if (p.used > p.total) {
        error("allowances", line, `Used (${p.used}) is more than the total (${p.total})${p.shared ? " across the Crew" : ""}`);
        continue;
      }
      if (p.planQuantity !== null && p.total !== p.planQuantity) warn("allowances", line, `Total ${p.total} differs from the plan's ${p.planQuantity}; kept the sheet's total`);
      if (p.allowance.granted === p.total && p.allowance.used === p.used) {
        count("allowances", "existing");
        continue;
      }
      const after = one(await tx.update(allowances).set({ granted: p.total, used: p.used }).where(eq(allowances.id, p.allowance.id)).returning());
      await audit(tx, input.actor, { action: "allowance.imported", entity: "allowance", entityId: p.allowance.id, before: p.allowance, after });
      count("allowances", "updated");
    }
  }

  // --- Visits tab: every scan or manual approval, approved or declined. ---
  async function importVisits(tx: Tx, passes: Passes) {
    const text = input.files.visits;
    if (!text) return;
    const t = readTable(text, VISIT_COLUMNS, ["timestamp", "passNumber", "venueId", "benefit", "result"]);
    if (t.missing.length) return error("visits", 1, `Missing columns: ${t.missing.join(", ")}`);
    const approvedPerAllowance = new Map<string, number>();

    for (const r of t.records) {
      const at = parseLagosTimestamp(r.get("timestamp"), input.dateOrder);
      const membership = await passes.get(r.get("passNumber"));
      const [venue] = await tx.select().from(venues).where(eq(venues.externalRef, r.get("venueId")));
      const type = benefitFromSheet(r.get("benefit"));
      const resultText = r.get("result");
      const approved = /^approved/i.test(resultText);
      const declined = /^declined/i.test(resultText);
      if (!at) error("visits", r.line, `Timestamp "${r.get("timestamp")}" isn't a date and time (${input.dateOrder})`);
      else if (!membership) error("visits", r.line, `Pass ${r.get("passNumber")} isn't in the Members tab or the database`);
      else if (!venue) error("visits", r.line, `Venue ID ${r.get("venueId")} isn't in the Partners tab or the database`);
      else if (!type) error("visits", r.line, `Benefit "${r.get("benefit")}" not recognised`);
      else if (!approved && !declined) error("visits", r.line, `Result "${resultText}" should start with Approved or Declined`);
      if (!at || !membership || !venue || !type || (!approved && !declined)) continue;

      const scanCode = `pilot:${createHash("sha256").update([r.get("timestamp"), r.get("passNumber"), r.get("venueId"), r.get("benefit"), resultText].join("|")).digest("hex").slice(0, 32)}`;
      const [already] = await tx.select({ id: redemptions.id }).from(redemptions).where(eq(redemptions.scanCode, scanCode));
      if (already) {
        count("visits", "existing");
        continue;
      }
      const [offer] = await tx.select().from(offers).where(and(eq(offers.venueId, venue.id), eq(offers.benefitType, type), isNull(offers.deletedAt)));
      if (!offer) {
        error("visits", r.line, `${venue.name} has no ${type} offer`);
        continue;
      }
      const day = serviceDate(venue.openingHours, at);
      const { allowance } = approved ? await allowanceFor(tx, membership, type, day) : { allowance: null };
      if (approved && allowance) approvedPerAllowance.set(allowance.id, (approvedPerAllowance.get(allowance.id) ?? 0) + 1);
      const reasonText = declined ? resultText.replace(/^declined\s*[-:–(]?\s*/i, "").replace(/\)$/, "") : "";
      const reason = declined ? declineFromSheet(reasonText) : null;
      if (declined && !reason) warn("visits", r.line, `Decline reason "${reasonText}" has no platform equivalent; kept in the audit log`);
      const method = /manual/i.test(r.get("method")) ? "manual" : "online";

      const row = one(await tx
        .insert(redemptions)
        .values({
          occurredAt: at,
          serviceDate: day,
          memberId: membership.memberId,
          membershipId: membership.id,
          venueId: venue.id,
          offerId: offer.id,
          benefitType: type,
          allowanceId: allowance?.id ?? null,
          result: approved ? "approved" : "declined",
          reason,
          method,
          scanCode,
        })
        .returning());
      await audit(tx, input.actor, { action: "redemption.imported", entity: "redemption", entityId: row.id, after: { ...row, pilotResult: resultText, pilotNote: r.get("note") || null } });
      count("visits", "created");
    }

    // The Allowances tab is the source of truth for counts; flag visits that don't add up.
    for (const [allowanceId, n] of approvedPerAllowance) {
      const [a] = await tx.select().from(allowances).where(eq(allowances.id, allowanceId));
      if (a && a.granted !== null && n > a.used) warn("visits", null, `${n} approved visits for an allowance the sheet says was used ${a.used} times (allowance ${allowanceId})`);
    }
  }

  // --- Bookings tab: concierge bookings. ---
  async function importBookings(tx: Tx, passes: Passes) {
    const text = input.files.bookings;
    if (!text) return;
    const t = readTable(text, BOOKING_COLUMNS, ["passNumber", "venue", "date"]);
    if (t.missing.length) return error("bookings", 1, `Missing columns: ${t.missing.join(", ")}`);

    for (const r of t.records) {
      const membership = await passes.get(r.get("passNumber"));
      const date = parseDate(r.get("date"), input.dateOrder);
      const statusKey = key(r.get("status"));
      const status = BOOKING_STATUS[statusKey];
      if (!membership) {
        error("bookings", r.line, `Pass ${r.get("passNumber")} isn't in the Members tab or the database`);
        continue;
      }
      if (!date) {
        error("bookings", r.line, `Date "${r.get("date")}" isn't a date (${input.dateOrder})`);
        continue;
      }
      if (!status) warn("bookings", r.line, `Status "${r.get("status")}" not recognised; imported as requested`);
      const place = r.get("venue");
      const [venue] = await tx
        .select()
        .from(venues)
        .where(or(eq(venues.externalRef, place), eq(venues.name, place)));
      const [existing] = await tx
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.membershipId, membership.id), eq(bookings.bookingDate, date), venue ? eq(bookings.venueId, venue.id) : eq(bookings.eventName, place)));
      if (existing) {
        count("bookings", "existing");
        continue;
      }
      const type = r.get("benefit") ? benefitFromSheet(r.get("benefit")) : null;
      if (r.get("benefit") && !type) warn("bookings", r.line, `Benefit "${r.get("benefit")}" not recognised; booking imported without it`);
      const { allowance } = type ? await allowanceFor(tx, membership, type, date) : { allowance: null };
      const row = one(await tx
        .insert(bookings)
        .values({
          memberId: membership.memberId,
          membershipId: membership.id,
          venueId: venue?.id ?? null,
          eventName: venue ? null : place,
          bookingDate: date,
          status: status ?? "requested",
          allowanceId: allowance?.id ?? null,
        })
        .returning());
      await audit(tx, input.actor, { action: "booking.imported", entity: "booking", entityId: row.id, after: row });
      count("bookings", "created");
    }
  }
}
