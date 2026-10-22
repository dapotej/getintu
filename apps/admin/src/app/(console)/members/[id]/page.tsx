"use client";
import { Badge, Button, Card, Checkbox, cx, DECLINE_LABELS, EmptyState, Field, formatDate, formatLagosDateTime, Icon, Input, PageHeader, Select, Table, Td, Textarea } from "@intu/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ActionForm, checked, text, textOrNull } from "@/components/forms";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import { isNight } from "@/lib/catalogue";
import { PAID_BY, STATUS_LABELS, statusTone } from "@/lib/labels";
import type { Allowance, MemberDetail, Membership, Plan } from "@/lib/types";

const METHOD: Record<string, string> = { online: "Scan", offline: "Scan (offline)", manual: "Manual" };

export default function MemberPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useStaff();
  const { data, error, setData } = useApi<MemberDetail>(`/admin/members/${id}`);
  const [editing, setEditing] = useState(false);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const { member, memberships, visits } = data;

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/members" className="inline-flex items-center gap-1 hover:text-fg">
            <Icon name="back" className="size-4" /> Members
          </Link>
        }
        title={member.fullName}
        subtitle={[member.phone, member.email, member.country].filter(Boolean).join("  ·  ")}
        actions={
          can("members.write") ? (
            <Button tone="secondary" onClick={() => setEditing((e) => !e)}>
              {editing ? "Close" : "Edit details"}
            </Button>
          ) : null
        }
      />
      {editing ? (
        <Card title="Edit details" className="mb-6">
          <ActionForm
            className="grid gap-4 sm:grid-cols-2"
            success="Saved."
            action={async (form) =>
              setData(
                await api<MemberDetail>(`/admin/members/${id}`, {
                  method: "PATCH",
                  body: { fullName: text(form, "fullName"), phone: text(form, "phone").replace(/\s/g, ""), email: textOrNull(form, "email"), country: textOrNull(form, "country"), consentMarketing: checked(form, "consentMarketing") },
                }),
              )
            }
          >
            {(busy) => (
              <>
                <Field label="Full name">
                  <Input name="fullName" defaultValue={member.fullName} required />
                </Field>
                <Field label="Phone (WhatsApp)">
                  <Input name="phone" defaultValue={member.phone} required />
                </Field>
                <Field label="Email">
                  <Input name="email" type="email" defaultValue={member.email ?? ""} />
                </Field>
                <Field label="Country">
                  <Input name="country" maxLength={2} defaultValue={member.country ?? ""} />
                </Field>
                <div className="sm:col-span-2">
                  <Checkbox name="consentMarketing" defaultChecked={member.consentMarketing} label="Agreed to marketing messages" />
                </div>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={busy}>
                    Save
                  </Button>
                </div>
              </>
            )}
          </ActionForm>
        </Card>
      ) : null}

      <div className="flex flex-col gap-6">
        {memberships.length === 0 ? (
          <Card>
            <EmptyState title="No passes yet">Add a membership below to give this member access.</EmptyState>
          </Card>
        ) : null}
        {memberships.map((ms) => (
          <MembershipCard key={ms.id} ms={ms} canWrite={can("members.write")} onChange={setData} />
        ))}
        {can("members.write") ? <AddMembership memberId={id} onChange={setData} /> : null}

        <Card title="Visits" description="The last 50 scans at venues, in Lagos time." flush>
          {visits.length === 0 ? (
            <EmptyState title="No visits yet" />
          ) : (
            <Table head={["When", "Venue", "Benefit", "Result", "How"]}>
              {visits.map((v) => (
                <tr key={v.id}>
                  <Td className="whitespace-nowrap tabular-nums">{formatLagosDateTime(v.occurredAt)}</Td>
                  <Td>{v.venueName}</Td>
                  <Td>
                    {v.category.name}
                    {v.partySize > 1 ? <span className="text-muted"> · party of {v.partySize}</span> : null}
                  </Td>
                  <Td>
                    {v.result === "approved" ? (
                      <Badge dot tone="night">
                        Approved
                      </Badge>
                    ) : (
                      <Badge dot tone="danger">
                        {v.reason ? (DECLINE_LABELS[v.reason] ?? v.reason) : "Declined"}
                      </Badge>
                    )}
                  </Td>
                  <Td className="text-muted">{METHOD[v.method] ?? v.method}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}

function AllowanceBar({ a }: { a: Allowance }) {
  const night = isNight(a.category.code);
  const left = a.granted === null ? null : a.granted - a.used;
  const pct = a.granted ? Math.min(100, Math.round((a.used / a.granted) * 100)) : 0;
  return (
    <div className="rounded-lg border border-line p-3.5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span aria-hidden className={cx("size-2 shrink-0 rounded-full", night ? "bg-brand-night" : "bg-brand-day")} />
          <span className="truncate text-sm font-semibold text-fg" title={a.category.name}>
            {a.category.name}
          </span>
        </div>
        {a.shared ? <Badge tone="accent">Shared by Crew</Badge> : null}
      </div>
      <p className="mt-2 text-sm tabular-nums">
        {left === null ? (
          <span className="text-fg">Unlimited</span>
        ) : (
          <>
            <span className="text-lg font-bold text-fg">{left}</span> <span className="text-muted">of {a.granted} left</span>
          </>
        )}
        <span className="text-muted"> · {a.used} used</span>
      </p>
      {a.granted ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle" role="presentation">
          <div className={cx("h-full rounded-full", left === 0 ? "bg-danger" : night ? "bg-night" : "bg-day")} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function MembershipCard({ ms, canWrite, onChange }: { ms: Membership; canWrite: boolean; onChange: (d: MemberDetail) => void }) {
  const [changing, setChanging] = useState(false);
  const action = ms.status === "active" ? "suspend" : ms.status === "suspended" ? "reinstate" : null;
  const meta = [
    `${formatDate(ms.startsOn)} – ${formatDate(ms.endsOn)}`,
    ms.arrivesOn ? `Arrives ${formatDate(ms.arrivesOn)}` : null,
    ms.departsOn ? `Departs ${formatDate(ms.departsOn)}` : null,
    PAID_BY[ms.paymentSource] ?? ms.paymentSource,
    ms.groupId ? "Crew" : null,
  ].filter(Boolean);
  return (
    <Card
      title={`${ms.plan.name}${ms.passNumber ? ` · ${ms.passNumber}` : ""}`}
      description={meta.join("  ·  ")}
      actions={
        <>
          <Badge dot tone={statusTone(ms.status)}>
            {STATUS_LABELS[ms.status] ?? ms.status}
          </Badge>
          {canWrite && action ? (
            <Button size="sm" tone={action === "suspend" && !changing ? "secondary" : "ghost"} onClick={() => setChanging((c) => !c)}>
              {changing ? "Cancel" : action === "suspend" ? "Suspend" : "Reinstate"}
            </Button>
          ) : null}
        </>
      }
    >
      {changing && action ? (
        <ActionForm
          className="mb-5 flex flex-col gap-3 rounded-lg bg-subtle p-4"
          action={async (form) => {
            onChange(await api<MemberDetail>(`/admin/memberships/${ms.id}/${action}`, { method: "POST", body: { reason: text(form, "reason") } }));
            setChanging(false);
          }}
        >
          {(busy) => (
            <>
              <Field label="Reason" hint={action === "suspend" ? "Venues will decline this pass until it's reinstated. Kept in the audit log." : "Kept in the audit log."}>
                <Textarea name="reason" required minLength={3} />
              </Field>
              <div>
                <Button type="submit" tone={action === "suspend" ? "danger" : "primary"} disabled={busy}>
                  {action === "suspend" ? "Suspend membership" : "Reinstate membership"}
                </Button>
              </div>
            </>
          )}
        </ActionForm>
      ) : null}
      {ms.allowances.length === 0 ? (
        <p className="text-sm text-muted">This plan has no benefits.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ms.allowances.map((a) => (
            <AllowanceBar key={a.id} a={a} />
          ))}
        </div>
      )}
    </Card>
  );
}

function AddMembership({ memberId, onChange }: { memberId: string; onChange: (d: MemberDetail) => void }) {
  const [open, setOpen] = useState(false);
  const { data } = useApi<{ plans: Plan[] }>(open ? "/admin/plans" : null);
  if (!open)
    return (
      <div>
        <Button tone="secondary" onClick={() => setOpen(true)}>
          <Icon name="plus" className="size-4" /> Add a membership
        </Button>
      </div>
    );
  return (
    <Card title="Add a membership" description="For gifts, client accounts and fixes. Paid passes arrive through checkout." actions={<Button size="sm" tone="ghost" onClick={() => setOpen(false)}>Cancel</Button>}>
      <ActionForm
        className="grid gap-4 sm:grid-cols-2"
        action={async (form) => {
          onChange(
            await api<MemberDetail>(`/admin/members/${memberId}/memberships`, {
              method: "POST",
              body: {
                planId: text(form, "planId"),
                paymentSource: text(form, "paymentSource"),
                ...(text(form, "startsOn") ? { startsOn: text(form, "startsOn") } : {}),
                ...(text(form, "endsOn") ? { endsOn: text(form, "endsOn") } : {}),
                arrivesOn: textOrNull(form, "arrivesOn"),
                departsOn: textOrNull(form, "departsOn"),
                note: text(form, "note") || undefined,
              },
            }),
          );
          setOpen(false);
        }}
      >
        {(busy) => (
          <>
            <Field label="Plan">
              <Select name="planId" required>
                {data?.plans.filter((p) => p.active).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Paid by">
              <Select name="paymentSource" defaultValue="gift">
                <option value="gift">Gift</option>
                <option value="client">Client account</option>
                <option value="direct">Member (paid outside checkout)</option>
              </Select>
            </Field>
            <Field label="Starts" hint="Leave blank to use the plan's season">
              <Input name="startsOn" type="date" />
            </Field>
            <Field label="Ends">
              <Input name="endsOn" type="date" />
            </Field>
            <Field label="Arrives in Lagos">
              <Input name="arrivesOn" type="date" />
            </Field>
            <Field label="Departs">
              <Input name="departsOn" type="date" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Note" hint="Why this was added. Kept in the audit log.">
                <Input name="note" />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                Add membership
              </Button>
            </div>
          </>
        )}
      </ActionForm>
    </Card>
  );
}
