// The admin API, imitated in the browser for the demo build. It starts from the same TEST seed
// data and catalogue as the real database and answers the same routes with the same shapes.
// Nothing is saved: reloading the page starts again.
import { allowancePeriods, benefitFor, costPlan, covers, type CostingBenefit, type CostingPlan } from "@intu/rules";
import { testBenefits, testFxRates, testMembers, testMemberships, testOffers, testPartners, testPlanPrices, testPlans, testVenues } from "../../../packages/db/src/seed-data";
import { flattenTaxonomy } from "../../../packages/db/src/taxonomy";
import { readTable } from "../../api/src/import/csv";

type Row = Record<string, unknown> & { id: string };
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const stamp = { createdAt: "2026-10-21T09:00:00.000Z", updatedAt: "2026-10-21T09:00:00.000Z" };

const ME = { id: "demo-founder", role: "founder", fullName: "Dapo Tejuoso", email: "founder@example.com" };
const PERMISSIONS = ["members.read", "members.write", "plans.read", "plans.write", "partners.read", "partners.write", "staff.manage", "import.pilot", "audit.read"];

// The catalogue, with ids, as migration 0009 loads it.
const categories: Row[] = [];
for (const r of flattenTaxonomy()) {
  categories.push({ id: uid(), code: r.code, parentId: categories.find((c) => c.code === r.parentCode)?.id ?? null, level: r.level, name: r.name, sortOrder: r.sortOrder, customerVisible: true, active: true });
}
const cat = (code: string) => categories.find((c) => c.code === code)!;
const catRef = (id: unknown) => {
  const c = categories.find((x) => x.id === id)!;
  return { id: c.id, code: c.code, name: c.name, level: c.level };
};

const plans: Row[] = testPlans.map((p) => ({ description: null, durationDays: null, groupSize: 1, overheadPerMemberMinor: 0, active: true, ...stamp, ...p }) as Row);
const prices: Row[] = testPlanPrices.map((p) => ({ id: uid(), ...p }) as Row);
const benefits: Row[] = testBenefits.map(({ categoryCode, ...b }) => ({ id: uid(), sharedByGroup: false, capOncePerVenuePerMonth: false, capOncePerVenuePerDay: true, drawPerPerson: false, allowedVenueTiers: ["standard"], costBasis: "per_use", plannedCostMinor: null, expectedUsePct: 60, ...b, categoryId: cat(categoryCode).id }) as Row);
const partnerDefaults = { contactName: null, contactPhone: null, active: true, hasBankDetails: false, isTest: false, settlementTerms: null, contactEmail: null };
const partners: Row[] = testPartners.map((p) => ({ ...partnerDefaults, ...stamp, ...p, hasBankDetails: p.id.endsWith("102") }) as Row);
const venues: Row[] = testVenues.map((v) => ({ description: null, capacityNotes: null, externalRef: null, active: true, ...stamp, ...v }) as Row);
const offers: Row[] = testOffers.map(({ categoryCode, ...o }) => ({ description: null, validHours: null, validFrom: null, validTo: null, active: true, retailMinor: null, offerModel: "included", pricesArePlaceholders: false, ...o, categoryId: cat(categoryCode).id }) as Row);
const members: Row[] = testMembers.map((m) => ({ consentMarketing: false, ...stamp, ...m, consentTermsAt: String(m.consentTermsAt) }) as Row);
const memberships: Row[] = testMemberships.map((m) => ({ arrivesOn: null, departsOn: null, paymentSource: "direct", ...m }) as Row);
memberships.find((m) => m.passNumber === "TEST-0001")!.arrivesOn = "2026-12-14";
memberships.find((m) => m.passNumber === "TEST-0001")!.departsOn = "2027-01-03";
const allowances: Row[] = [];
const visits: Row[] = [];
const staff: Row[] = [
  { id: "demo-founder", role: "founder", fullName: "Dapo Tejuoso", email: "founder@example.com", active: true, createdAt: "2026-10-21T09:00:00.000Z" },
  { id: uid(), role: "ops_lead", fullName: "TEST Amaka Ops Lead", email: "amaka@example.com", active: true, createdAt: "2026-10-22T09:00:00.000Z" },
  { id: uid(), role: "concierge", fullName: "TEST Bisi Concierge", email: "bisi@example.com", active: true, createdAt: "2026-10-23T09:00:00.000Z" },
];

function grant(membership: Row) {
  for (const b of benefits.filter((x) => x.planId === membership.planId)) {
    const shared = b.sharedByGroup === true && membership.groupId !== null;
    for (const range of allowancePeriods(b.period as "per_pass", String(membership.startsOn), String(membership.endsOn))) {
      if (shared && allowances.some((a) => a.benefitId === b.id && a.groupId === membership.groupId && a.periodStart === range.start)) continue;
      allowances.push({ id: uid(), benefitId: b.id, membershipId: shared ? null : membership.id, groupId: shared ? membership.groupId : null, periodStart: range.start, periodEnd: range.end, granted: b.quantity, used: 0 });
    }
  }
}
memberships.forEach(grant);

// A few sample visits so profiles aren't empty.
function sampleVisit(pass: string, venueId: string, at: string, serviceCode: string, result: "approved" | "declined", reason: string | null = null, partySize = 1) {
  const ms = memberships.find((m) => m.passNumber === pass)!;
  visits.push({ id: uid(), memberId: ms.memberId, membershipId: ms.id, venueId, occurredAt: at, serviceDate: at.slice(0, 10), categoryId: cat(serviceCode).id, result, reason, method: "online", partySize });
  if (result !== "approved") return;
  const planBenefits = benefits.filter((b) => b.planId === ms.planId).map((b) => ({ b, categoryCode: String(categories.find((c) => c.id === b.categoryId)?.code) }));
  const b = benefitFor(planBenefits, serviceCode)?.b;
  const a = allowances.find((x) => x.benefitId === b?.id && (x.membershipId === ms.id || (x.groupId && x.groupId === ms.groupId)));
  if (a) a.used = Number(a.used) + 1;
}
sampleVisit("TEST-0001", "00000000-0000-4000-8000-000000000201", "2026-12-15T13:05:00.000Z", "C03-S01-T01", "approved");
sampleVisit("TEST-0001", "00000000-0000-4000-8000-000000000204", "2026-12-16T15:30:00.000Z", "C04-S05-T01", "approved");
sampleVisit("TEST-0001", "00000000-0000-4000-8000-000000000201", "2026-12-15T13:07:00.000Z", "C03-S01-T01", "declined", "DUPLICATE_SCAN");
sampleVisit("TEST-0001", "00000000-0000-4000-8000-000000000206", "2026-12-19T23:40:00.000Z", "C06-S01-T03", "approved");
sampleVisit("TEST-0002", "00000000-0000-4000-8000-000000000204", "2026-12-20T11:00:00.000Z", "C04-S05-T01", "declined", "BENEFIT_NOT_IN_PLAN");
sampleVisit("TEST-0005", "00000000-0000-4000-8000-000000000207", "2026-12-26T22:30:00.000Z", "C06-S04-T01", "approved", null, 4);
sampleVisit("TEST-0006", "00000000-0000-4000-8000-000000000207", "2026-12-27T22:10:00.000Z", "C06-S04-T01", "declined", "ALLOWANCE_USED_UP");

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
const need = <T>(v: T | undefined, what: string): T => {
  if (v === undefined) throw new HttpError(404, "not_found", `${what} not found`);
  return v;
};

const planOut = (p: Row) => ({ ...p, prices: prices.filter((x) => x.planId === p.id).sort((a, b) => String(a.currency).localeCompare(String(b.currency))) });
const fxRates: Row[] = testFxRates.map((r) => ({ id: r.currency, ...r, updatedAt: stamp.updatedAt }));
const planDetail = (id: string) => {
  const p = planOut(need(plans.find((x) => x.id === id), "Plan"));
  const bs = benefits
    .filter((b) => b.planId === id)
    .map((b) => ({ ...b, category: catRef(b.categoryId) }))
    .sort((a, b) => a.category.code.localeCompare(b.category.code));
  // The same costing the API does: active offers at active venues of the tiers each benefit allows.
  const live = offers
    .filter((o) => o.active)
    .map((o) => ({ o, v: venues.find((v) => v.id === o.venueId)! }))
    .filter(({ v }) => v.active && partners.find((x) => x.id === v.partnerId)?.active);
  const costing = costPlan(
    p as unknown as CostingPlan,
    bs.map((b) => ({
      ...(b as unknown as CostingBenefit),
      offers: live
        .filter(({ o, v }) => covers(b.category.code, catRef(o.categoryId).code) && (b.allowedVenueTiers as string[]).includes(String(v.tier)))
        .map(({ o }) => ({ rateMinor: Number(o.rateMinor), placeholder: Boolean(o.pricesArePlaceholders) })),
    })),
    Object.fromEntries(fxRates.map((r) => [r.currency, Number(r.koboPerUnit)])),
  );
  return { plan: { ...p, benefits: bs, costing } };
};
const memberDetail = (id: string) => {
  const member = need(members.find((m) => m.id === id), "Member");
  return {
    member,
    memberships: memberships
      .filter((m) => m.memberId === id)
      .map((ms) => {
        const plan = plans.find((p) => p.id === ms.planId)!;
        return {
          ...ms,
          plan: { id: plan.id, name: plan.name, code: plan.code },
          allowances: allowances
            .filter((a) => a.membershipId === ms.id || (a.groupId !== null && a.groupId === ms.groupId))
            .map((a) => ({ ...a, category: catRef(benefits.find((b) => b.id === a.benefitId)?.categoryId), shared: a.groupId !== null }))
            .sort((a, b) => a.category.code.localeCompare(b.category.code)),
        };
      }),
    visits: visits
      .filter((v) => v.memberId === id)
      .sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)))
      .map((v) => ({ ...v, venueName: venues.find((x) => x.id === v.venueId)?.name, category: catRef(v.categoryId) })),
  };
};
const offerOut = (o: Row) => ({ ...o, category: catRef(o.categoryId) });

type Handler = (m: RegExpMatchArray, body: Record<string, unknown>, query: URLSearchParams) => unknown;
const routes: [string, RegExp, Handler][] = [
  ["GET", /^\/admin\/me$/, () => ({ staff: ME, permissions: PERMISSIONS })],

  ["GET", /^\/admin\/categories$/, () => ({ categories: [...categories].sort((a, b) => String(a.code).localeCompare(String(b.code))) })],
  ["POST", /^\/admin\/categories$/, (_m, b) => {
    const parent = b.parentId ? need(categories.find((c) => c.id === b.parentId), "Category") : null;
    if (parent?.level === "service") throw new HttpError(400, "too_deep", "Service types can't have children");
    const siblings = categories.filter((c) => c.parentId === (parent?.id ?? null));
    const n = Math.max(0, ...siblings.map((s) => Number(String(s.code).split("-").at(-1)?.slice(1)))) + 1;
    const pad = String(n).padStart(2, "0");
    const code = parent ? `${String(parent.code)}-${parent.level === "category" ? "S" : "T"}${pad}` : `C${pad}`;
    const level = parent ? (parent.level === "category" ? "subcategory" : "service") : "category";
    const row = { id: uid(), code, parentId: parent?.id ?? null, level, name: b.name, sortOrder: siblings.length + 1, customerVisible: true, active: true } as Row;
    categories.push(row);
    return { category: row };
  }],
  ["PATCH", /^\/admin\/categories\/([^/]+)$/, (m, b) => {
    const row = need(categories.find((c) => c.id === m[1]), "Category");
    if (b.active === false && categories.some((c) => c.parentId === row.id && c.active)) throw new HttpError(409, "has_active_children", "Turn off the entries under it first");
    return { category: Object.assign(row, b) };
  }],

  ["GET", /^\/admin\/members$/, (_m, _b, q) => {
    const term = (q.get("q") ?? "").toLowerCase();
    const hit = (m: Row) =>
      !term ||
      [m.fullName, m.phone, m.email].some((f) => String(f ?? "").toLowerCase().includes(term)) ||
      memberships.some((ms) => ms.memberId === m.id && String(ms.passNumber ?? "").toLowerCase().includes(term));
    return {
      members: members
        .filter(hit)
        .sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)))
        .map((m) => ({
          ...m,
          memberships: memberships.filter((ms) => ms.memberId === m.id).map((ms) => ({ id: ms.id, status: ms.status, passNumber: ms.passNumber, endsOn: ms.endsOn, planName: plans.find((p) => p.id === ms.planId)?.name })),
        })),
    };
  }],
  ["GET", /^\/admin\/members\/([^/]+)$/, (m) => memberDetail(m[1]!)],
  ["POST", /^\/admin\/members$/, (_m, b) => {
    if (!/^\+[1-9]\d{6,14}$/.test(String(b.phone))) throw new HttpError(400, "invalid_request", "Request body failed validation: phone – Use international format, e.g. +447700900001");
    if (members.some((m) => m.phone === b.phone)) throw new HttpError(409, "duplicate_phone", "A member with this phone number already exists");
    const row = { id: uid(), email: null, country: null, consentMarketing: false, isTest: true, ...stamp, ...b, ...(b.country ? { country: String(b.country).toUpperCase() } : {}) } as Row;
    members.push(row);
    return memberDetail(row.id);
  }],
  ["PATCH", /^\/admin\/members\/([^/]+)$/, (m, b) => {
    Object.assign(need(members.find((x) => x.id === m[1]), "Member"), b, b.country ? { country: String(b.country).toUpperCase() } : {});
    return memberDetail(m[1]!);
  }],
  ["POST", /^\/admin\/members\/([^/]+)\/memberships$/, (m, b) => {
    const plan = need(plans.find((p) => p.id === b.planId), "Plan");
    const row = { id: uid(), memberId: m[1], planId: plan.id, startsOn: b.startsOn ?? plan.seasonStartsOn, endsOn: b.endsOn ?? plan.seasonEndsOn, arrivesOn: b.arrivesOn ?? null, departsOn: b.departsOn ?? null, status: "active", paymentSource: b.paymentSource, groupId: null, passNumber: null } as Row;
    if (!row.startsOn || !row.endsOn) throw new HttpError(400, "dates_required", "This plan has no season dates; give startsOn and endsOn");
    memberships.push(row);
    grant(row);
    return memberDetail(String(m[1]));
  }],
  ["POST", /^\/admin\/memberships\/([^/]+)\/(suspend|reinstate)$/, (m) => {
    const ms = need(memberships.find((x) => x.id === m[1]), "Membership");
    const [from, to] = m[2] === "suspend" ? ["active", "suspended"] : ["suspended", "active"];
    if (ms.status !== from) throw new HttpError(409, "invalid_status", `Only ${from} memberships can be changed this way`);
    ms.status = to;
    return memberDetail(String(ms.memberId));
  }],

  ["GET", /^\/admin\/plans$/, () => ({ plans: [...plans].sort((a, b) => String(a.name).localeCompare(String(b.name))).map(planOut) })],
  ["GET", /^\/admin\/plans\/([^/]+)$/, (m) => planDetail(m[1]!)],
  ["POST", /^\/admin\/plans$/, (_m, b) => {
    if (plans.some((p) => p.code === b.code)) throw new HttpError(409, "duplicate_code", `A plan with code ${String(b.code)} already exists`);
    const row = { id: uid(), description: null, seasonStartsOn: null, seasonEndsOn: null, durationDays: null, onSaleFrom: null, onSaleTo: null, groupSize: 1, active: true, isTest: true, ...stamp, ...b } as Row;
    plans.push(row);
    return planDetail(row.id);
  }],
  ["PATCH", /^\/admin\/plans\/([^/]+)$/, (m, b) => (Object.assign(need(plans.find((p) => p.id === m[1]), "Plan"), b), planDetail(m[1]!))],
  ["PUT", /^\/admin\/plans\/([^/]+)\/prices$/, (m, b) => {
    for (let i = prices.length - 1; i >= 0; i--) if (prices[i]!.planId === m[1]) prices.splice(i, 1);
    for (const p of b.prices as Row[]) prices.push({ ...p, id: uid(), planId: m[1] });
    return planDetail(m[1]!);
  }],
  ["POST", /^\/admin\/plans\/([^/]+)\/benefits$/, (m, b) => {
    if (benefits.some((x) => x.planId === m[1] && x.categoryId === b.categoryId)) throw new HttpError(409, "duplicate_benefit", "This plan already has that benefit");
    benefits.push({ id: uid(), planId: m[1], quantity: null, sharedByGroup: false, capOncePerVenuePerMonth: false, capOncePerVenuePerDay: true, drawPerPerson: false, allowedVenueTiers: ["standard"], costBasis: "per_use", plannedCostMinor: null, expectedUsePct: 60, ...b } as Row);
    return planDetail(m[1]!);
  }],
  ["PATCH", /^\/admin\/benefits\/([^/]+)$/, (m, b) => {
    const row = need(benefits.find((x) => x.id === m[1]), "Benefit");
    Object.assign(row, b);
    return planDetail(String(row.planId));
  }],

  ["GET", /^\/admin\/fx-rates$/, () => ({ rates: fxRates })],
  ["PUT", /^\/admin\/fx-rates$/, (_m, b) => {
    for (const r of b.rates as { currency: string; koboPerUnit: number }[]) {
      const row = fxRates.find((x) => x.currency === r.currency);
      if (row) Object.assign(row, r, { updatedAt: now() });
      else fxRates.push({ id: r.currency, ...r, updatedAt: now() });
    }
    return { rates: fxRates };
  }],

  ["GET", /^\/admin\/partners$/, () => ({ partners: [...partners].sort((a, b) => String(a.tradingName).localeCompare(String(b.tradingName))) })],
  ["GET", /^\/admin\/partners\/([^/]+)$/, (m) => ({ partner: need(partners.find((p) => p.id === m[1]), "Partner"), venues: venues.filter((v) => v.partnerId === m[1]) })],
  ["POST", /^\/admin\/partners$/, (_m, b) => {
    const row = { ...partnerDefaults, id: uid(), isTest: true, ...stamp, ...b } as Row;
    partners.push(row);
    return { partner: row };
  }],
  ["PATCH", /^\/admin\/partners\/([^/]+)$/, (m, b) => ({ partner: Object.assign(need(partners.find((p) => p.id === m[1]), "Partner"), b) })],
  ["GET", /^\/admin\/venues$/, (_m, _b, q) => ({ venues: venues.filter((v) => !q.get("partnerId") || v.partnerId === q.get("partnerId")).sort((a, b) => String(a.name).localeCompare(String(b.name))) })],
  ["GET", /^\/admin\/venues\/([^/]+)$/, (m) => {
    const venue = need(venues.find((v) => v.id === m[1]), "Venue");
    const partner = need(partners.find((p) => p.id === venue.partnerId), "Partner");
    return { venue, partner: { id: partner.id, tradingName: partner.tradingName }, offers: offers.filter((o) => o.venueId === m[1]).map(offerOut) };
  }],
  ["POST", /^\/admin\/venues$/, (_m, b) => {
    const row = { id: uid(), tier: "standard", description: null, capacityNotes: null, externalRef: null, active: true, isTest: true, ...stamp, ...b } as Row;
    venues.push(row);
    return { venue: row };
  }],
  ["PATCH", /^\/admin\/venues\/([^/]+)$/, (m, b) => ({ venue: Object.assign(need(venues.find((v) => v.id === m[1]), "Venue"), b) })],
  ["POST", /^\/admin\/offers$/, (_m, b) => {
    const c = need(categories.find((x) => x.id === b.categoryId), "Category");
    if (c.level !== "service") throw new HttpError(400, "not_a_service", "An offer delivers one service type, not a whole category");
    const row = { id: uid(), description: null, rateCurrency: "NGN", retailMinor: null, offerModel: "included", pricesArePlaceholders: false, validHours: null, validFrom: null, validTo: null, dailyCap: null, active: true, ...b } as Row;
    offers.push(row);
    return { offer: offerOut(row) };
  }],
  ["PATCH", /^\/admin\/offers\/([^/]+)$/, (m, b) => ({ offer: offerOut(Object.assign(need(offers.find((o) => o.id === m[1]), "Offer"), b)) })],

  ["GET", /^\/admin\/staff$/, () => ({ staff })],
  ["POST", /^\/admin\/staff$/, (_m, b) => {
    const email = String(b.email).toLowerCase();
    if (staff.some((s) => s.email === email)) throw new HttpError(409, "duplicate_email", "Someone with this email is already on the team");
    const row = { id: uid(), active: true, createdAt: now(), ...b, email } as Row;
    staff.push(row);
    return { staff: row };
  }],
  ["PATCH", /^\/admin\/staff\/([^/]+)$/, (m, b) => {
    if (m[1] === ME.id) throw new HttpError(409, "cannot_change_self", "Ask another team lead to change your own role or access");
    return { staff: Object.assign(need(staff.find((s) => s.id === m[1]), "Staff member"), b) };
  }],

  // The demo reads the uploaded CSVs and counts rows; the real import validates and writes them.
  ["POST", /^\/admin\/import\/pilot$/, (_m, b) => {
    const files = b.files as Record<string, string | undefined>;
    const counts: Record<string, { created: number; existing: number }> = {};
    for (const [tab, text] of Object.entries(files)) {
      if (!text) continue;
      counts[tab] = { created: readTable(text, {}, []).records.length, existing: 0 };
    }
    const dryRun = Boolean(b.dryRun);
    return {
      report: {
        dryRun,
        committed: !dryRun,
        counts,
        warnings: [],
        errors: [],
        notImported: ["Demo preview: rows were counted, not checked or saved. The real console validates every row and reports errors by line."],
      },
    };
  }],
];

/** Answers an admin API request the way the real API would. */
export async function handle(method: string, url: URL, body: unknown): Promise<{ status: number; json: unknown }> {
  await new Promise((r) => setTimeout(r, 120));
  for (const [m, re, fn] of routes) {
    const match = url.pathname.match(re);
    if (m !== method || !match) continue;
    try {
      return { status: method === "POST" && !url.pathname.match(/suspend|reinstate|import/) ? 201 : 200, json: structuredClone(fn(match, (body ?? {}) as Record<string, unknown>, url.searchParams)) };
    } catch (err) {
      if (err instanceof HttpError) return { status: err.status, json: { error: { code: err.code, message: err.message } } };
      throw err;
    }
  }
  return { status: 404, json: { error: { code: "not_found", message: `No demo route for ${method} ${url.pathname}` } } };
}
