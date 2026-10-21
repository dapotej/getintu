"use client";
import { Badge, BENEFIT_LABELS, Button, Card, DECLINE_LABELS, Field, formatDate, formatLagosDateTime, Input, NIGHT_BENEFITS, PageHeader, Select, Table, Td, Textarea } from "@intu/ui";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ActionForm, checked, text, textOrNull } from "@/components/forms";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import type { MemberDetail, Membership, Plan } from "@/lib/types";

export default function MemberPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useStaff();
  const { data, error, setData } = useApi<MemberDetail>(`/admin/members/${id}`);
  const [editing, setEditing] = useState(false);

  if (error) return <p className="text-sm text-pop">{error}</p>;
  if (!data) return <p className="text-sm text-cream-muted">Loading…</p>;
  const { member, memberships, visits } = data;

  return (
    <>
      <PageHeader
        title={member.fullName}
        subtitle={[member.phone, member.email, member.country].filter(Boolean).join(" · ")}
        actions={can("members.write") ? <Button tone="secondary" onClick={() => setEditing((e) => !e)}>{editing ? "Close" : "Edit details"}</Button> : null}
      />
      {editing ? (
        <Card title="Edit details" className="mb-6 max-w-xl">
          <ActionForm
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
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="consentMarketing" defaultChecked={member.consentMarketing} /> Agreed to marketing messages
                </label>
                <Button type="submit" disabled={busy}>
                  Save
                </Button>
              </>
            )}
          </ActionForm>
        </Card>
      ) : null}

      <div className="space-y-6">
        {memberships.length === 0 ? <p className="text-sm text-cream-muted">No memberships yet.</p> : null}
        {memberships.map((ms) => (
          <MembershipCard key={ms.id} ms={ms} canWrite={can("members.write")} onChange={setData} />
        ))}
        {can("members.write") ? <AddMembership memberId={id} onChange={setData} /> : null}

        <Card title="Visits">
          <Table head={["When (Lagos)", "Venue", "Benefit", "Result", "How"]} empty={visits.length === 0 && "No visits yet."}>
            {visits.map((v) => (
              <tr key={v.id}>
                <Td className="whitespace-nowrap">{formatLagosDateTime(v.occurredAt)}</Td>
                <Td>{v.venueName}</Td>
                <Td>
                  {BENEFIT_LABELS[v.benefitType] ?? v.benefitType}
                  {v.partySize > 1 ? <span className="text-cream-muted"> · party of {v.partySize}</span> : null}
                </Td>
                <Td>{v.result === "approved" ? <Badge tone="night">Approved</Badge> : <Badge tone="pop">{v.reason ? (DECLINE_LABELS[v.reason] ?? v.reason) : "Declined"}</Badge>}</Td>
                <Td className="text-cream-muted">{v.method}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}

function MembershipCard({ ms, canWrite, onChange }: { ms: Membership; canWrite: boolean; onChange: (d: MemberDetail) => void }) {
  const [changing, setChanging] = useState(false);
  const statusTone = ms.status === "active" ? "night" : ms.status === "suspended" ? "pop" : "muted";
  const action = ms.status === "active" ? "suspend" : ms.status === "suspended" ? "reinstate" : null;
  return (
    <Card
      title={`${ms.plan.name}${ms.passNumber ? ` · ${ms.passNumber}` : ""}`}
      actions={
        <div className="flex items-center gap-3">
          <Badge tone={statusTone}>{ms.status}</Badge>
          {canWrite && action ? (
            <Button tone={action === "suspend" ? "danger" : "secondary"} onClick={() => setChanging((c) => !c)}>
              {changing ? "Cancel" : action === "suspend" ? "Suspend" : "Reinstate"}
            </Button>
          ) : null}
        </div>
      }
    >
      <p className="mb-4 text-sm text-cream-muted">
        Valid {formatDate(ms.startsOn)} to {formatDate(ms.endsOn)}
        {ms.arrivesOn ? ` · arrives ${formatDate(ms.arrivesOn)}` : ""}
        {ms.departsOn ? ` · departs ${formatDate(ms.departsOn)}` : ""} · {ms.paymentSource}
        {ms.groupId ? " · Crew" : ""}
      </p>
      {changing && action ? (
        <ActionForm
          className="mb-4 space-y-3 rounded-lg border border-ink-line p-4"
          action={async (form) => {
            onChange(await api<MemberDetail>(`/admin/memberships/${ms.id}/${action}`, { method: "POST", body: { reason: text(form, "reason") } }));
            setChanging(false);
          }}
        >
          {(busy) => (
            <>
              <Field label="Reason" hint="Kept in the audit log.">
                <Textarea name="reason" required minLength={3} />
              </Field>
              <Button type="submit" tone={action === "suspend" ? "danger" : "primary"} disabled={busy}>
                {action === "suspend" ? "Suspend membership" : "Reinstate membership"}
              </Button>
            </>
          )}
        </ActionForm>
      ) : null}
      <Table head={["Benefit", "Used", "Left", "Period"]} empty={ms.allowances.length === 0 && "This plan has no benefits."}>
        {ms.allowances.map((a) => (
          <tr key={a.id}>
            <Td>
              <span className={NIGHT_BENEFITS.has(a.benefitType) ? "text-night" : "text-day"}>{BENEFIT_LABELS[a.benefitType] ?? a.benefitType}</span>
              {a.shared ? <span className="ml-2"><Badge>shared by Crew</Badge></span> : null}
            </Td>
            <Td>{a.used}</Td>
            <Td>{a.granted === null ? "Unlimited" : a.granted - a.used}</Td>
            <Td className="text-cream-muted">
              {formatDate(a.periodStart)} – {formatDate(a.periodEnd)}
            </Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

function AddMembership({ memberId, onChange }: { memberId: string; onChange: (d: MemberDetail) => void }) {
  const [open, setOpen] = useState(false);
  const { data } = useApi<{ plans: Plan[] }>(open ? "/admin/plans" : null);
  if (!open)
    return (
      <Button tone="secondary" onClick={() => setOpen(true)}>
        Add a membership
      </Button>
    );
  return (
    <Card title="Add a membership" className="max-w-xl" actions={<Button tone="ghost" onClick={() => setOpen(false)}>Cancel</Button>}>
      <p className="mb-4 text-sm text-cream-muted">For gifts, client accounts and fixes. Paid passes arrive through checkout.</p>
      <ActionForm
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
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starts" hint="Blank: the plan's season">
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
            </div>
            <Field label="Note" hint="Why this was added; kept in the audit log.">
              <Input name="note" />
            </Field>
            <Button type="submit" disabled={busy}>
              Add membership
            </Button>
          </>
        )}
      </ActionForm>
    </Card>
  );
}
