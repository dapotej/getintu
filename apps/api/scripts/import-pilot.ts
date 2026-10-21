// Imports the pilot sheet from a folder of CSV exports (one per tab):
//   pnpm --filter @intu/api import:pilot -- --dir ./pilot-export --tier Essential=<planId> --tier Plus=<planId> --tier Crew=<planId> [--date-order DMY] [--commit]
// File names: partners.csv, members.csv, allowances.csv, visits.csv, bookings.csv (any missing tab is skipped).
// Without --commit it's a dry run.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createDb, databaseUrl } from "@intu/db";
import { importPilot, type PilotFiles } from "../src/import/pilot.ts";

const { values } = parseArgs({
  options: {
    dir: { type: "string" },
    tier: { type: "string", multiple: true, default: [] },
    "date-order": { type: "string", default: "DMY" },
    commit: { type: "boolean", default: false },
  },
});
if (!values.dir) throw new Error("--dir is required");
const dateOrder = values["date-order"];
if (dateOrder !== "ISO" && dateOrder !== "DMY" && dateOrder !== "MDY") throw new Error("--date-order must be ISO, DMY or MDY");

const files: PilotFiles = {};
for (const tab of ["partners", "members", "allowances", "visits", "bookings"] as const) {
  const path = join(values.dir, `${tab}.csv`);
  if (existsSync(path)) files[tab] = readFileSync(path, "utf8");
}
const tierPlans = Object.fromEntries(
  values.tier.map((t) => {
    const [name, planId] = t.split("=");
    if (!name || !planId) throw new Error(`--tier ${t} should look like Plus=<planId>`);
    return [name, planId];
  }),
);

const { db, sql } = createDb(databaseUrl(), { max: 2 });
const report = await importPilot(db, { files, tierPlans, dateOrder, dryRun: !values.commit, actor: { type: "system" } });
await sql.end();
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.errors.length ? 1 : 0;
