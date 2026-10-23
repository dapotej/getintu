"use client";
// One client: its people and their passes, passes waiting for a name, usage as totals, invoices.
import { Badge, Button, Card, DetailList, EmptyState, Field, formatDate, formatMoney, Icon, Input, Notice, PageHeader, parseMajorToMinor, Select, SidePanel, StatCard, Table, Td, Textarea } from "@intu/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CLIENT_KINDS, ClientForm } from "@/components/client-form";
import { ActionForm, intOrNull, text, textOrNull } from "@/components/forms";
import { ReasonPanel } from "@/components/reason-panel";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import type { ClientDetail, ClientInvoice, ClientSeat, Plan } from "@/lib/types";

const datesOf = (form: FormData) => ({ ...(text(form, "startsOn") ? { startsOn: text(form, "startsOn") } : {}), ...(text(form, "endsOn") ? { endsOn: text(form, "endsOn") } : {}) });
const personOf = (form: FormData) => ({ fullName: text(form, "fullName"), phone: text(form, "phone").replace(/[\s-]/g, ""), email: textOrNull(form, "email"), customerRef: textOrNull(form, "customerRef") });

function PersonFields() {
  return (
    <>
      <Field label="Full name">
        <Input name="fullName" required />
      </Field>
      <Field label="Phone" hint="International format, e.g. +2348012345678. Someone already with intu keeps their account.">
        <Input name="phone" type="tel" required />
      </Field>
      <Field label="Email">
        <Input name="email" type="email" />
      </Field>
      <Field label="Customer reference" hint="The client's own id for them, e.g. a bank's customer number">
        <Input name="customerRef" />
      </Field>
    </>
  );
}

/** The plan and dates for new passes; dates default to the contract's, then the plan's season. */
function TermsFields({ plans, detail }: { plans: Plan[]; detail: ClientDetail }) {
  const c = detail.client;
  return (
    <>
      <Field label="Plan">
        <Select name="planId" required defaultValue={detail.seats[0]?.plan.id ?? ""}>
          <option value="">Choose…</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Starts" hint={c.contractStartsOn ? `Blank: ${formatDate(c.contractStartsOn)}, or today if later` : "Blank: the plan's season, or today"}>
          <Input name="startsOn" type="date" />
        </Field>
        <Field label="Ends" hint={c.contractEndsOn ? `Blank: ${formatDate(c.contractEndsOn)}` : "Blank: the plan's season"}>
          <Input name="endsOn" type="date" />
        </Field>
      </div>
    </>
  );
}

interface UploadReport {
  rows: { line: number; fullName: string; phone: string; status: "new" | "existing" | "error"; message: string | null }[];
  counts: { new: number; existing: number; errors: number };
  limitError: string | null;
  ignoredColumns: string[];
  committed: boolean;
}

/** Upload a list: check it first, then add everyone on it. */
function UploadForm({ id, plans, detail, onDone }: { id: string; plans: Plan[]; detail: ClientDetail; onDone: (d: ClientDetail) => void }) {
  const [csv, setCsv] = useState<{ name: string; text: string } | null>(null);
  const [report, setReport] = useState<UploadReport | null>(null);
  const [checkedFor, setCheckedFor] = useState<string | null>(null);
  return (
    <ActionForm
      action={async (form) => {
        if (!csv) throw new Error("Choose the list to upload");
        const body = { csv: csv.text, planId: text(form, "planId"), ...datesOf(form) };
        const key = JSON.stringify(body);
        const commit = checkedFor === key && report !== null && report.counts.errors === 0 && !report.limitError;
        const res = await api<UploadReport>(`/admin/clients/${id}/people/upload`, { method: "POST", body: { ...body, commit } });
        setReport(res);
        setCheckedFor(key);
        if (res.committed) onDone(await api<ClientDetail>(`/admin/clients/${id}`));
      }}
    >
      {(busy) => (
        <>
          <p className="text-sm text-muted">A CSV with a header row: name and phone, and optionally email and customer reference. Nothing is added until the list has no errors.</p>
          <Field label="List (CSV)">
            <Input
              type="file"
              accept=".csv,text/csv"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                setReport(null);
                setCsv(file ? { name: file.name, text: await file.text() } : null);
              }}
            />
          </Field>
          <TermsFields plans={plans} detail={detail} />
          {report && !report.committed ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm">
                <span className="font-semibold">{report.counts.new}</span> new to intu, <span className="font-semibold">{report.counts.existing}</span> already members, <span className={report.counts.errors ? "font-semibold text-danger" : "font-semibold"}>{report.counts.errors}</span> with errors
              </p>
              {report.limitError ? <Notice>{report.limitError}</Notice> : null}
              {report.rows
                .filter((r) => r.status === "error")
                .map((r) => (
                  <p key={r.line} className="text-sm text-danger">
                    Line {r.line}: {r.fullName || r.phone} — {r.message}
                  </p>
                ))}
            </div>
          ) : null}
          {report?.committed ? <Notice tone="success">Added {report.counts.new + report.counts.existing} people.</Notice> : null}
          <Button type="submit" disabled={busy || !csv}>
            {report && !report.committed && report.counts.errors === 0 && !report.limitError ? `Add ${report.counts.new + report.counts.existing} people` : "Check the list"}
          </Button>
        </>
      )}
    </ActionForm>
  );
}

function SeatRow({ seat: s, writable, onChange }: { seat: ClientSeat; writable: boolean; onChange: (d: ClientDetail) => void }) {
  const status = s.membership ? (s.membership.status === "active" ? { label: "Active", tone: "night" as const } : { label: s.membership.status === "suspended" ? "Suspended" : "Ended", tone: "neutral" as const }) : { label: "Waiting for a name", tone: "day" as const };
  return (
    <tr>
      <Td>
        {s.member ? (
          <>
            <Link href={`/members/${s.member.id}`} className="font-semibold text-fg hover:text-accent">
              {s.member.fullName}
            </Link>
            <span className="block text-xs text-muted">{s.member.phone}</span>
          </>
        ) : (
          <span className="text-faint">–</span>
        )}
      </Td>
      <Td className="text-muted">{s.customerRef ?? "–"}</Td>
      <Td>
        {s.plan.name}
        <span className="block whitespace-nowrap text-xs text-muted">
          {formatDate(s.membership?.startsOn ?? s.startsOn)} – {formatDate(s.membership?.endsOn ?? s.endsOn)}
        </span>
      </Td>
      <Td>
        <Badge dot tone={status.tone}>
          {status.label}
        </Badge>
      </Td>
      <Td className="whitespace-nowrap text-right">
        {!writable ? null : s.member ? (
          <ReasonPanel
            button="Remove"
            title={`Remove ${s.member.fullName}`}
            description="Their pass ends today and this seat is free for someone else. They keep their intu account."
            confirm="Remove and end pass"
            hint="e.g. Left the bank, or closed their account. Kept in the audit log."
            danger
            onConfirm={async (reason) => onChange(await api<ClientDetail>(`/admin/client-seats/${s.id}/release`, { method: "POST", body: { reason } }))}
          />
        ) : (
          <div className="flex justify-end gap-1">
            <SidePanel
              title="Give out this pass"
              description={`${s.plan.name}, until ${formatDate(s.endsOn)}`}
              trigger={(open) => (
                <Button size="sm" tone="secondary" onClick={open}>
                  Give out
                </Button>
              )}
            >
              {(close) => (
                <ActionForm
                  action={async (form) => {
                    onChange(await api<ClientDetail>(`/admin/client-seats/${s.id}/assign`, { method: "POST", body: personOf(form) }));
                    close();
                  }}
                >
                  {(busy) => (
                    <>
                      <PersonFields />
                      <Button type="submit" disabled={busy}>
                        Give out pass
                      </Button>
                    </>
                  )}
                </ActionForm>
              )}
            </SidePanel>
            <Button size="sm" tone="ghost" onClick={async () => onChange(await api<ClientDetail>(`/admin/client-seats/${s.id}/remove`, { method: "POST", body: {} }))}>
              Delete
            </Button>
          </div>
        )}
      </Td>
    </tr>
  );
}

function InvoiceRow({ invoice: i, writable, onChange }: { invoice: ClientInvoice; writable: boolean; onChange: (d: ClientDetail) => void }) {
  const set = async (status: ClientInvoice["status"]) => onChange(await api<ClientDetail>(`/admin/client-invoices/${i.id}`, { method: "PATCH", body: { status } }));
  return (
    <tr>
      <Td className="font-mono font-semibold">
        {i.number}
        {i.note ? <span className="block font-sans text-xs font-normal text-muted">{i.note}</span> : null}
      </Td>
      <Td className="whitespace-nowrap">
        {formatDate(i.issuedOn)}
        {i.dueOn ? <span className="block text-xs text-muted">Due {formatDate(i.dueOn)}</span> : null}
      </Td>
      <Td className="tabular-nums">{formatMoney(i.amountMinor, i.currency)}</Td>
      <Td>
        <Badge dot tone={i.status === "paid" ? "night" : i.status === "void" ? "neutral" : "day"}>
          {i.status === "paid" ? `Paid ${i.paidOn ? formatDate(i.paidOn) : ""}` : i.status === "void" ? "Void" : "Waiting for payment"}
        </Badge>
      </Td>
      <Td className="whitespace-nowrap text-right">
        {writable && i.status === "issued" ? (
          <>
            <Button size="sm" tone="secondary" onClick={() => set("paid")}>
              Mark paid
            </Button>
            <Button size="sm" tone="ghost" onClick={() => set("void")}>
              Void
            </Button>
          </>
        ) : null}
      </Td>
    </tr>
  );
}

export default function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useStaff();
  const writable = can("clients.write");
  const { data, error, setData } = useApi<ClientDetail>(`/admin/clients/${id}`);
  const plans = useApi<{ plans: Plan[] }>(can("plans.read") ? "/admin/plans" : null);
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const { client: c, seats, invoices, usage } = data;
  const planList = plans.data?.plans ?? [];

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/clients" className="inline-flex items-center gap-1 hover:text-fg">
            <Icon name="back" className="size-4" /> Clients
          </Link>
        }
        title={c.name}
        subtitle={[CLIENT_KINDS[c.kind], c.contractStartsOn && c.contractEndsOn ? `Contract ${formatDate(c.contractStartsOn)} – ${formatDate(c.contractEndsOn)}` : null, c.isTest ? "TEST" : null].filter(Boolean).join("  ·  ")}
        actions={
          <>
            <Badge dot tone={c.active ? "night" : "neutral"}>
              {c.active ? "Active" : "Inactive"}
            </Badge>
            {writable ? (
              <SidePanel
                title="Edit client"
                trigger={(open) => (
                  <Button size="sm" tone="secondary" onClick={open}>
                    <Icon name="edit" className="size-4" /> Edit
                  </Button>
                )}
              >
                {(close) => (
                  <ClientForm
                    client={c}
                    submit="Save client"
                    onSave={async (fields) => {
                      setData(await api<ClientDetail>(`/admin/clients/${id}`, { method: "PATCH", body: fields }));
                      close();
                    }}
                  />
                )}
              </SidePanel>
            ) : null}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Passes given out" value={usage.seats.assigned} hint={`${usage.seats.total} set up${usage.seats.limit !== null ? ` of ${usage.seats.limit} in the contract` : ""}`} />
        <StatCard label="Waiting for a name" value={usage.seats.open} tone="day" />
        <StatCard label="Visits this month" value={usage.visitsThisMonth} hint={`${usage.visits} in all`} tone="night" />
        <StatCard label="People who visited this month" value={usage.peopleThisMonth} />
      </div>

      <div className="grid items-start gap-6 2xl:grid-cols-[1.6fr_1fr]">
        <div className="flex flex-col gap-6">
          <Card
            title="People and passes"
            description="Each pass is paid for by the client. Removing someone ends their pass today and frees the seat."
            flush
            actions={
              writable ? (
                <div className="flex flex-wrap gap-2">
                  <SidePanel
                    title="Add a person"
                    trigger={(open) => (
                      <Button size="sm" tone="secondary" onClick={open}>
                        <Icon name="plus" className="size-4" /> Add a person
                      </Button>
                    )}
                  >
                    {(close) => (
                      <ActionForm
                        action={async (form) => {
                          setData(await api<ClientDetail>(`/admin/clients/${id}/people`, { method: "POST", body: { ...personOf(form), planId: text(form, "planId"), ...datesOf(form) } }));
                          close();
                        }}
                      >
                        {(busy) => (
                          <>
                            <PersonFields />
                            <TermsFields plans={planList} detail={data} />
                            <Button type="submit" disabled={busy}>
                              Add person
                            </Button>
                          </>
                        )}
                      </ActionForm>
                    )}
                  </SidePanel>
                  <SidePanel
                    title="Upload a list"
                    trigger={(open) => (
                      <Button size="sm" tone="secondary" onClick={open}>
                        <Icon name="upload" className="size-4" /> Upload a list
                      </Button>
                    )}
                  >
                    {() => <UploadForm id={id} plans={planList} detail={data} onDone={setData} />}
                  </SidePanel>
                  <SidePanel
                    title="Passes waiting for a name"
                    description="Set up passes now and give each one out later, e.g. for a launch."
                    trigger={(open) => (
                      <Button size="sm" tone="ghost" onClick={open}>
                        Add passes without names
                      </Button>
                    )}
                  >
                    {(close) => (
                      <ActionForm
                        action={async (form) => {
                          setData(await api<ClientDetail>(`/admin/clients/${id}/seats`, { method: "POST", body: { count: intOrNull(form, "count") ?? 0, planId: text(form, "planId"), ...datesOf(form) } }));
                          close();
                        }}
                      >
                        {(busy) => (
                          <>
                            <Field label="How many">
                              <Input name="count" type="number" min={1} max={500} required className="w-36" />
                            </Field>
                            <TermsFields plans={planList} detail={data} />
                            <Button type="submit" disabled={busy}>
                              Add passes
                            </Button>
                          </>
                        )}
                      </ActionForm>
                    )}
                  </SidePanel>
                </div>
              ) : null
            }
          >
            {seats.length === 0 ? (
              <EmptyState title="No passes yet">{writable ? "Add a person, upload a list, or set up passes to give out later." : null}</EmptyState>
            ) : (
              <Table head={["Person", "Customer ref", "Pass", "Status", ""]}>
                {seats.map((s) => (
                  <SeatRow key={s.id} seat={s} writable={writable} onChange={setData} />
                ))}
              </Table>
            )}
          </Card>

          <Card title="Invoices" description="Recorded by hand: sent and collected outside intu for now." flush
            actions={
              can("clients.invoices") ? (
                <SidePanel
                  title="Record an invoice"
                  trigger={(open) => (
                    <Button size="sm" tone="secondary" onClick={open}>
                      <Icon name="plus" className="size-4" /> Record invoice
                    </Button>
                  )}
                >
                  {(close) => (
                    <ActionForm
                      action={async (form) => {
                        const amountMinor = parseMajorToMinor(text(form, "amount"));
                        if (amountMinor === null) throw new Error("Amount: enter a number, e.g. 2,500,000");
                        setData(await api<ClientDetail>(`/admin/clients/${id}/invoices`, { method: "POST", body: { number: text(form, "number"), issuedOn: text(form, "issuedOn"), dueOn: textOrNull(form, "dueOn"), amountMinor, currency: text(form, "currency"), note: textOrNull(form, "note") } }));
                        close();
                      }}
                    >
                      {(busy) => (
                        <>
                          <Field label="Invoice number">
                            <Input name="number" required />
                          </Field>
                          <div className="grid grid-cols-2 gap-4">
                            <Field label="Issued">
                              <Input name="issuedOn" type="date" required />
                            </Field>
                            <Field label="Due">
                              <Input name="dueOn" type="date" />
                            </Field>
                          </div>
                          <div className="grid grid-cols-[1fr_7rem] gap-4">
                            <Field label="Amount">
                              <Input name="amount" inputMode="decimal" required />
                            </Field>
                            <Field label="Currency">
                              <Select name="currency" defaultValue="NGN">
                                <option value="NGN">NGN</option>
                                <option value="GBP">GBP</option>
                                <option value="USD">USD</option>
                              </Select>
                            </Field>
                          </div>
                          <Field label="Note" hint="e.g. 40 passes, December 2026">
                            <Textarea name="note" />
                          </Field>
                          <Button type="submit" disabled={busy}>
                            Record invoice
                          </Button>
                        </>
                      )}
                    </ActionForm>
                  )}
                </SidePanel>
              ) : null
            }
          >
            {invoices.length === 0 ? (
              <EmptyState title="No invoices yet" />
            ) : (
              <Table head={["Number", "Issued", "Amount", "Status", ""]}>
                {invoices.map((i) => (
                  <InvoiceRow key={i.id} invoice={i} writable={can("clients.invoices")} onChange={setData} />
                ))}
              </Table>
            )}
          </Card>
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-2 2xl:grid-cols-1">
          <Card title="Usage" description="Totals only. The client never sees an individual's visits." flush>
            {usage.byService.length === 0 ? (
              <EmptyState title="No visits yet" />
            ) : (
              <Table head={["Service", "This month", "In all"]}>
                {usage.byService.map((u) => (
                  <tr key={u.name}>
                    <Td>{u.name}</Td>
                    <Td className="tabular-nums">{u.thisMonth}</Td>
                    <Td className="tabular-nums">{u.visits}</Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
          <Card title="Details">
            <DetailList
              items={[
                ["Contact", [c.contactName, c.contactPhone, c.contactEmail].filter(Boolean).join(" · ") || null],
                ["Billing email", c.billingEmail],
                ["Contract reference", c.contractRef],
                ["Seats in the contract", c.seats === null ? "No limit" : String(c.seats)],
                ["Notes", c.notes],
              ]}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
