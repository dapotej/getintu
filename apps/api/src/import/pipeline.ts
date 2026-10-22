// Reads and checks the "Lagos Partner Pipeline" tab of the partner sheet. Pure: no database, so
// the console demo can run the same checks in the browser. ./partners.ts writes the result.
import type { schema } from "@intu/db";
import { readTable } from "./csv.ts";
import { nairaToKobo } from "./values.ts";

type PartnerInsert = typeof schema.partners.$inferInsert;

export interface PipelineImportReport {
  dryRun: boolean;
  committed: boolean;
  counts: { created: number; updated: number; unchanged: number };
  warnings: { line: number; message: string }[];
  errors: { line: number; message: string }[];
}

const COLUMNS = {
  name: ["partner / lead", "partner", "lead", "partner or lead"],
  category: ["main category"],
  subcategory: [],
  proposedOffer: ["proposed offer", "offer"],
  priority: [],
  status: [],
  offerModel: ["offer model"],
  cost: ["net cost (ngn)", "net cost", "cost"],
  retail: ["retail price (ngn)", "retail price", "retail"],
  contact: ["contact / owner", "contact", "owner"],
  nextAction: ["next action"],
  notes: [],
} as const;

const norm = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

/** Older names in the sheet for catalogue entries that have since been renamed. */
const RENAMED: Record<string, string> = { healthcareassistance: "doctoroncall" };

const MODEL_LABEL: Record<NonNullable<PartnerInsert["offerModel"]>, string> = {
  included: "included in the pass",
  included_or_add_on: "included, or as an add-on",
  add_on: "a paid add-on",
  member_privilege: "a member privilege",
};

const STATUS: Record<string, PartnerInsert["status"]> = {
  "": "prospect",
  prospect: "prospect",
  toidentify: "to_identify",
  toverify: "to_verify",
  personallead: "personal_lead",
  negotiating: "negotiating",
  signed: "signed",
  live: "live",
  paused: "paused",
  declined: "declined",
};

/** The sheet's offer models. There are no credits (Dapo, 22 Oct 2026): credit offers become included. */
function offerModelFrom(raw: string): { model: PartnerInsert["offerModel"]; credits: boolean } {
  const t = raw.toLowerCase();
  const credits = t.includes("credit");
  const addOn = t.includes("add-on") || t.includes("add on");
  const included = t.includes("included") || t.includes("sponsor") || credits;
  if (t.includes("privilege")) return { model: "member_privilege", credits };
  if (addOn && included) return { model: "included_or_add_on", credits };
  if (addOn) return { model: "add_on", credits };
  if (included) return { model: "included", credits };
  return { model: null, credits };
}

/** Placeholders until partners quote (Dapo, 22 Oct 2026): ₦25,000 cost, retail at cost plus half. */
export const PLACEHOLDER_COST_MINOR = 2_500_000;
const retailFromCost = (cost: number) => Math.round((cost * 3) / 2);

export interface PipelineRow {
  line: number;
  name: string;
  values: {
    status: NonNullable<PartnerInsert["status"]>;
    priority: "P1" | "P2" | "P3" | null;
    categoryId: string | null;
    proposedOffer: string | null;
    offerModel: PartnerInsert["offerModel"];
    proposedCostMinor: number;
    proposedRetailMinor: number;
    pricesArePlaceholders: boolean;
    contactName: string | null;
    nextAction: string | null;
    notes: string | null;
  };
}

/**
 * Reads and checks the pipeline tab without touching the database. `tree` is the catalogue, used
 * to find each row's subcategory by name. Shared by the importer and the console demo.
 */
export function parsePipeline(csv: string, tree: { id: string; level: string; name: string; parentId: string | null }[]) {
  const rows: PipelineRow[] = [];
  const warnings: PipelineImportReport["warnings"] = [];
  const errors: PipelineImportReport["errors"] = [];
  const t = readTable(csv, COLUMNS, ["name", "status"]);
  if (t.missing.length) {
    errors.push({ line: 1, message: `Missing columns: ${t.missing.join(", ")}` });
    return { rows, warnings, errors };
  }
  const ignored = t.ignored.filter((h) => norm(h) !== "margin");
  if (ignored.length) warnings.push({ line: 1, message: `Columns not imported: ${ignored.join(", ")}` });

  const subcategoryFor = (main: string, sub: string) => {
    const parent = tree.find((c) => c.level === "category" && norm(c.name) === norm(main));
    const wanted = RENAMED[norm(sub)] ?? norm(sub);
    return tree.find((c) => c.level === "subcategory" && norm(c.name) === wanted && (!parent || c.parentId === parent.id)) ?? null;
  };

  for (const r of t.records) {
    const name = r.get("name");
    if (!name) continue;
    const status = STATUS[norm(r.get("status"))];
    if (!status) {
      errors.push({ line: r.line, message: `Status "${r.get("status")}" isn't one of Prospect, To identify, To verify, Personal lead, Negotiating, Signed, Live, Paused, Declined` });
      continue;
    }
    const priority = ["P1", "P2", "P3"].includes(r.get("priority").toUpperCase()) ? (r.get("priority").toUpperCase() as "P1" | "P2" | "P3") : null;
    if (r.get("priority") && !priority) warnings.push({ line: r.line, message: `Priority "${r.get("priority")}" should be P1, P2 or P3; left blank` });

    const category = r.get("subcategory") ? subcategoryFor(r.get("category"), r.get("subcategory")) : null;
    if (r.get("subcategory") && !category) warnings.push({ line: r.line, message: `"${r.get("category")} › ${r.get("subcategory")}" isn't in the catalogue; category left blank` });

    const { model, credits } = offerModelFrom(r.get("offerModel"));
    if (credits) warnings.push({ line: r.line, message: `${name}: offer model "${r.get("offerModel")}" uses credits, which intu doesn't offer; imported as ${MODEL_LABEL[model ?? "included"]}` });

    const costRaw = r.get("cost").replace(/\.0+$/, "");
    const retailRaw = r.get("retail").replace(/\.0+$/, "");
    const cost = costRaw ? nairaToKobo(costRaw) : null;
    const retail = retailRaw && retailRaw !== "0" ? nairaToKobo(retailRaw) : null;
    if ((costRaw && cost === null) || (retailRaw && retailRaw !== "0" && retail === null)) {
      errors.push({ line: r.line, message: `Cost "${r.get("cost")}" or retail "${r.get("retail")}" isn't a naira amount` });
      continue;
    }
    const proposedCostMinor = cost ?? PLACEHOLDER_COST_MINOR;
    rows.push({
      line: r.line,
      name,
      values: {
        status,
        priority,
        categoryId: category?.id ?? null,
        proposedOffer: r.get("proposedOffer") || null,
        offerModel: model,
        proposedCostMinor,
        proposedRetailMinor: retail ?? retailFromCost(proposedCostMinor),
        pricesArePlaceholders: cost === null || retail === null,
        contactName: r.get("contact") || null,
        nextAction: r.get("nextAction") || null,
        notes: r.get("notes") || null,
      },
    });
  }
  return { rows, warnings, errors };
}

