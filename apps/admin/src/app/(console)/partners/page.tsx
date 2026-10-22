"use client";
import { Badge, Button, Card, cx, EmptyState, Field, formatMoney, Icon, Input, Notice, PageHeader, Select, Table, Td } from "@intu/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ActionForm, text, textOrNull } from "@/components/forms";
import { HoursEditor, readHours } from "@/components/hours";
import { api, errorMessage, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import { markup, OFFER_MODELS, PARTNER_STATUSES, statusToneFor, useCatalogue } from "@/lib/catalogue";
import { CATEGORIES } from "@/lib/labels";
import type { Partner, PartnerStatus, Venue } from "@/lib/types";

type Report = { dryRun: boolean; committed: boolean; counts: { created: number; updated: number; unchanged: number }; warnings: { line: number; message: string }[]; errors: { line: number; message: string }[] };

export default function PartnersPage() {
  const { can } = useStaff();
  const writable = can("partners.write");
  const router = useRouter();
  const partners = useApi<{ partners: Partner[] }>("/admin/partners");
  const venues = useApi<{ venues: Venue[] }>("/admin/venues");
  const { byId } = useCatalogue();
  const [adding, setAdding] = useState<"partner" | "venue" | "import" | null>(null);
  const [filter, setFilter] = useState<PartnerStatus | "all">("all");

  const all = partners.data?.partners ?? [];
  const counts = useMemo(() => all.reduce((m, p) => m.set(p.status, (m.get(p.status) ?? 0) + 1), new Map<PartnerStatus, number>()), [all]);
  const shown = all.filter((p) => filter === "all" || p.status === filter);
  const venueCount = (id: string) => venues.data?.venues.filter((v) => v.partnerId === id).length ?? 0;

  return (
    <>
      <PageHeader
        title="Partners and venues"
        subtitle="Your pipeline, from first lead to live venue. Open a partner to update the deal, prices and next step."
        actions={
          writable ? (
            <>
              <Button tone="secondary" onClick={() => setAdding(adding === "import" ? null : "import")}>
                <Icon name="upload" className="size-4" /> Import pipeline
              </Button>
              <Button tone="secondary" onClick={() => setAdding(adding === "partner" ? null : "partner")}>
                Add partner
              </Button>
              <Button onClick={() => setAdding(adding === "venue" ? null : "venue")}>
                <Icon name="plus" className="size-4" /> Add venue
              </Button>
            </>
          ) : null
        }
      />

      {adding === "import" ? <PipelineImport onDone={() => partners.reload()} /> : null}

      {adding === "partner" ? (
        <Card title="New partner" description="Starts as a prospect. Open it afterwards to add the deal details." className="mb-6">
          <ActionForm
            className="grid gap-4 sm:grid-cols-2"
            action={async (form) => {
              await api("/admin/partners", {
                method: "POST",
                body: { legalName: text(form, "legalName"), tradingName: text(form, "tradingName"), contactName: textOrNull(form, "contactName"), contactEmail: textOrNull(form, "contactEmail"), contactPhone: textOrNull(form, "contactPhone"), settlementTerms: textOrNull(form, "settlementTerms") },
              });
              partners.reload();
              setAdding(null);
            }}
          >
            {(busy) => (
              <>
                <Field label="Legal name">
                  <Input name="legalName" required />
                </Field>
                <Field label="Trading name">
                  <Input name="tradingName" required />
                </Field>
                <Field label="Contact name">
                  <Input name="contactName" />
                </Field>
                <Field label="Contact phone">
                  <Input name="contactPhone" type="tel" />
                </Field>
                <Field label="Contact email">
                  <Input name="contactEmail" type="email" />
                </Field>
                <Field label="Settlement terms">
                  <Input name="settlementTerms" placeholder="Monthly in arrears, bank transfer in naira" />
                </Field>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={busy}>
                    Add partner
                  </Button>
                </div>
              </>
            )}
          </ActionForm>
        </Card>
      ) : null}

      {adding === "venue" ? (
        <Card title="New venue" description="Offers and rates are added on the venue's page next." className="mb-6">
          <ActionForm
            className="grid gap-6 lg:grid-cols-2"
            action={async (form) => {
              const { venue } = await api<{ venue: Venue }>("/admin/venues", {
                method: "POST",
                body: { partnerId: text(form, "partnerId"), name: text(form, "name"), area: text(form, "area"), city: text(form, "city"), category: text(form, "category"), tier: text(form, "tier"), openingHours: readHours(form, "hours") },
              });
              router.push(`/venues/${venue.id}`);
            }}
          >
            {(busy) => (
              <>
                <div className="grid content-start gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Field label="Partner">
                      <Select name="partnerId" required>
                        {all.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.tradingName}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field label="Venue name">
                    <Input name="name" required />
                  </Field>
                  <Field label="Area">
                    <Input name="area" placeholder="Oniru" required />
                  </Field>
                  <Field label="City">
                    <Select name="city">
                      <option value="lagos">Lagos</option>
                      <option value="abuja">Abuja</option>
                    </Select>
                  </Field>
                  <Field label="Category">
                    <Select name="category">
                      {Object.entries(CATEGORIES).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <div className="sm:col-span-2">
                    <Field label="Tier" hint="Top-tier venues are only open to plans whose benefits include them.">
                      <Select name="tier">
                        <option value="standard">Standard</option>
                        <option value="top">Top tier</option>
                      </Select>
                    </Field>
                  </div>
                </div>
                <HoursEditor name="hours" />
                <div className="lg:col-span-2">
                  <Button type="submit" disabled={busy}>
                    Add venue
                  </Button>
                </div>
              </>
            )}
          </ActionForm>
        </Card>
      ) : null}

      <div role="group" aria-label="Filter by status" className="mb-4 flex flex-wrap gap-2">
        {(["all", ...Object.keys(PARTNER_STATUSES)] as (PartnerStatus | "all")[])
          .filter((s) => s === "all" || counts.has(s))
          .map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
              className={cx(
                "rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset transition-colors",
                filter === s ? "bg-primary text-primary-fg ring-primary" : "bg-surface text-muted ring-line hover:text-fg",
              )}
            >
              {s === "all" ? "All" : PARTNER_STATUSES[s]} <span className="tabular-nums opacity-70">{s === "all" ? all.length : counts.get(s)}</span>
            </button>
          ))}
      </div>

      <Card flush>
        {partners.error ? <div className="p-5"><p className="text-sm text-danger">{partners.error}</p></div> : null}
        {partners.data && shown.length === 0 ? (
          <EmptyState title="No partners here yet">Add one, or import the pipeline tab from your partner sheet.</EmptyState>
        ) : (
          <Table head={["Partner", "Category", "Priority", "Status", "Cost → retail", "Next action", "Venues"]}>
            {shown.map((p) => {
              const category = p.categoryId ? byId.get(p.categoryId) : null;
              const m = markup(p.proposedCostMinor, p.proposedRetailMinor);
              return (
                <tr key={p.id}>
                  <Td>
                    <Link href={`/partners/${p.id}`} className="font-semibold text-fg hover:text-accent">
                      {p.tradingName}
                    </Link>
                    <p className="max-w-64 truncate text-xs text-muted" title={p.proposedOffer ?? undefined}>
                      {p.proposedOffer ?? (p.offerModel ? OFFER_MODELS[p.offerModel] : "")}
                    </p>
                  </Td>
                  <Td className="text-muted">{category?.name ?? <span className="text-faint">–</span>}</Td>
                  <Td>{p.priority ? <Badge tone={p.priority === "P1" ? "accent" : "neutral"}>{p.priority}</Badge> : <span className="text-faint">–</span>}</Td>
                  <Td>
                    <Badge dot tone={statusToneFor(p.status)}>
                      {PARTNER_STATUSES[p.status]}
                    </Badge>
                  </Td>
                  <Td className="whitespace-nowrap tabular-nums">
                    {p.proposedCostMinor !== null ? (
                      <>
                        {formatMoney(p.proposedCostMinor, "NGN")} → {p.proposedRetailMinor !== null ? formatMoney(p.proposedRetailMinor, "NGN") : "–"}
                        <span className="block text-xs text-muted">
                          {m ? `${m} markup` : ""}
                          {p.pricesArePlaceholders ? " · placeholder" : ""}
                        </span>
                      </>
                    ) : (
                      <span className="text-faint">–</span>
                    )}
                  </Td>
                  <Td className="max-w-56 text-muted">{p.nextAction ?? <span className="text-faint">–</span>}</Td>
                  <Td className="tabular-nums">{venueCount(p.id) || <span className="text-faint">0</span>}</Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}

/** Upload the "Lagos Partner Pipeline" tab as CSV: dry run first, then import. */
function PipelineImport({ onDone }: { onDone: () => void }) {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [checked, setChecked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(dryRun: boolean) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ report: Report }>("/admin/import/partners", { method: "POST", body: { csv: file.text, dryRun } });
      setReport(res.report);
      setChecked(dryRun ? file.text : null);
      if (!dryRun && res.report.committed) onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Import the partner pipeline" description="From the partner sheet, download the Lagos Partner Pipeline tab as CSV. Partners already here are updated, not duplicated. Blank costs get placeholder prices." className="mb-6">
      <div className="flex flex-wrap items-center gap-3">
        <label className="cursor-pointer rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-semibold text-fg shadow-xs hover:bg-subtle focus-within:ring-4 focus-within:ring-focus/15">
          {file ? "Choose another file" : "Choose CSV"}
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Pipeline CSV"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setReport(null);
              setFile(f ? { name: f.name, text: await f.text() } : null);
            }}
          />
        </label>
        <span className="text-sm text-muted">{file?.name ?? "No file chosen"}</span>
        <Button tone="secondary" disabled={!file || busy} onClick={() => run(true)}>
          {busy ? "Checking…" : "Dry run"}
        </Button>
        <Button disabled={busy || !report?.dryRun || report.errors.length > 0 || checked !== file?.text} onClick={() => run(false)}>
          Import
        </Button>
      </div>
      {error ? (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      {report ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm font-semibold">{report.committed ? "Imported" : report.dryRun ? "Dry run: nothing was changed" : "Not imported"}</p>
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">{report.counts.created} new</Badge>
            <Badge tone="accent">{report.counts.updated} updated</Badge>
            <Badge>{report.counts.unchanged} unchanged</Badge>
          </div>
          {report.errors.map((e, i) => (
            <Notice key={`e${i}`}>
              Line {e.line}: {e.message}
            </Notice>
          ))}
          {report.warnings.length ? (
            <ul className="list-disc pl-5 text-sm text-muted">
              {report.warnings.map((w, i) => (
                <li key={`w${i}`}>
                  Line {w.line}: {w.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
