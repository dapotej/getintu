"use client";
import { Badge, Button, Card, Field, Notice, PageHeader, Select, Table, Td } from "@intu/ui";
import { useState } from "react";
import { api, errorMessage, useApi } from "@/lib/api";
import type { ImportReport, Plan } from "@/lib/types";

const TABS = [
  { key: "partners", label: "Partners", hint: "Venue ID, name, area, benefit(s) offered, rate per visit (₦)…" },
  { key: "members", label: "Members", hint: "Pass number, tier, name, email, WhatsApp, arrival, departure, status, Crew group ID…" },
  { key: "allowances", label: "Allowances", hint: "Pass number, benefit, total, used, remaining" },
  { key: "visits", label: "Visits", hint: "Timestamp, pass number, venue ID, benefit, result, method, staff note" },
  { key: "bookings", label: "Bookings", hint: "Pass number, venue or event, date, benefit used, status" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const TIERS = ["Essential", "Plus", "Crew"];

export default function ImportPage() {
  const { data: plans } = useApi<{ plans: Plan[] }>("/admin/plans");
  const [files, setFiles] = useState<Partial<Record<TabKey, { name: string; text: string }>>>({});
  const [tierPlans, setTierPlans] = useState<Record<string, string>>({});
  const [dateOrder, setDateOrder] = useState<"DMY" | "MDY" | "ISO">("DMY");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [checkedFor, setCheckedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A commit is only offered for exactly the files and choices that passed a dry run.
  const fingerprint = JSON.stringify({ files, tierPlans, dateOrder });
  const canCommit = report?.dryRun && report.errors.length === 0 && checkedFor === fingerprint;

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const body = { files: Object.fromEntries(Object.entries(files).map(([k, v]) => [k, v.text])), tierPlans, dateOrder, dryRun };
      const res = await api<{ report: ImportReport }>("/admin/import/pilot", { method: "POST", body });
      setReport(res.report);
      setCheckedFor(dryRun ? fingerprint : null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Pilot import" subtitle="Brings the December pilot Google Sheet across. Download each tab as CSV (File → Download → Comma-separated values)." />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="1. Sheet tabs">
          <div className="space-y-4">
            {TABS.map((t) => (
              <Field key={t.key} label={t.label} hint={files[t.key] ? `Loaded ${files[t.key]?.name}` : t.hint}>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  aria-label={`${t.label} CSV`}
                  className="block w-full text-sm text-cream-muted file:mr-3 file:rounded-lg file:border-0 file:bg-ink-line file:px-3 file:py-2 file:text-cream"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return setFiles(({ [t.key]: _, ...rest }) => rest);
                    const text = await file.text();
                    setFiles((f) => ({ ...f, [t.key]: { name: file.name, text } }));
                  }}
                />
              </Field>
            ))}
          </div>
        </Card>
        <Card title="2. Choices">
          <div className="space-y-4">
            <p className="text-sm text-cream-muted">Which plan does each pilot tier become?</p>
            {TIERS.map((tier) => (
              <Field key={tier} label={tier}>
                <Select aria-label={`Plan for ${tier}`} value={tierPlans[tier] ?? ""} onChange={(e) => setTierPlans((m) => ({ ...m, [tier]: e.target.value }))}>
                  <option value="">Not used</option>
                  {plans?.plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ))}
            <Field label="How the sheet writes dates" hint="Times without a timezone are read as Lagos time.">
              <Select value={dateOrder} onChange={(e) => setDateOrder(e.target.value as typeof dateOrder)}>
                <option value="DMY">Day first (05/12/2026)</option>
                <option value="MDY">Month first (12/05/2026)</option>
                <option value="ISO">ISO (2026-12-05)</option>
              </Select>
            </Field>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => run(true)} disabled={busy || Object.keys(files).length === 0}>
                {busy ? "Checking…" : "Dry run"}
              </Button>
              <Button tone="danger" onClick={() => confirm("Import for real? This writes to the live database.") && run(false)} disabled={busy || !canCommit}>
                Import
              </Button>
            </div>
            <p className="text-xs text-cream-muted">Import unlocks after a dry run with no errors. Running it twice is safe: rows already imported are skipped.</p>
          </div>
        </Card>
      </div>

      {error ? (
        <div className="mt-6">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      {report ? <Report report={report} /> : null}
    </>
  );
}

function Report({ report }: { report: ImportReport }) {
  return (
    <Card title={report.committed ? "Imported" : report.dryRun ? "Dry run: nothing was changed" : "Not imported: fix the errors and try again"} className="mt-6">
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(report.counts).map(([name, c]) => (
          <Badge key={name} tone="night">
            {name}: {c.created} new{c.updated ? `, ${c.updated} updated` : ""}
            {c.existing ? `, ${c.existing} already there` : ""}
          </Badge>
        ))}
      </div>
      {report.errors.length ? <IssueTable title={`${report.errors.length} errors`} tone="pop" issues={report.errors} /> : <Notice tone="night">No errors.</Notice>}
      {report.warnings.length ? <IssueTable title={`${report.warnings.length} warnings`} tone="day" issues={report.warnings} /> : null}
      {report.notImported.length ? (
        <div className="mt-4 text-sm text-cream-muted">
          <p className="font-semibold text-cream">Not imported</p>
          <ul className="mt-1 list-disc pl-5">
            {report.notImported.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}

function IssueTable({ title, tone, issues }: { title: string; tone: "pop" | "day"; issues: ImportReport["errors"] }) {
  return (
    <div className="mt-4">
      <p className={`mb-2 text-sm font-semibold ${tone === "pop" ? "text-pop" : "text-day"}`}>{title}</p>
      <Table head={["Tab", "Line", "Problem"]}>
        {issues.map((i, n) => (
          <tr key={n}>
            <Td>{i.file}</Td>
            <Td>{i.line ?? "–"}</Td>
            <Td>{i.message}</Td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
