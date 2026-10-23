"use client";
import { Badge, Button, Card, Checkbox, cx, DECLINE_LABELS, EmptyState, Field, formatDate, formatLagosDateTime, formatMoney, Icon, Input, PageHeader, Select, SidePanel, Table, Td, Textarea } from "@intu/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ActionForm, checked, text, textOrNull } from "@/components/forms";
import { ReasonPanel } from "@/components/reason-panel";
import { api, ApiError, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import { isNight } from "@/lib/catalogue";
import { ORDER_STATUS, PROVIDER_LABELS, RefundLines, RefundPanel } from "@/components/refunds";
import { currentAllowances, lagosToday, PAID_BY, STATUS_LABELS, statusTone, tripText, vehicleText } from "@/lib/labels";
import type { Allowance, Booking, MemberDetail, Membership, Order, PaymentsOverview, Plan, Venue } from "@/lib/types";

const METHOD: Record<string, string> = { online: "Scan", offline: "Scan (offline)", manual: "Manual" };

export default function MemberPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useStaff();
  const { data, error, setData } = useApi<MemberDetail>(`/admin/members/${id}`);
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const { member, memberships, visits } = data;
  const today = lagosToday();
  const isCurrent = (ms: Membership) => (ms.status === "active" || ms.status === "suspended" || ms.status === "pending") && ms.endsOn >= today;
  const current = memberships.filter(isCurrent);
  const past = memberships.filter((ms) => !isCurrent(ms));

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
        media={
          member.photoUrl ? (
            <img src={member.photoUrl} alt={`Photo of ${member.fullName}`} className="size-16 shrink-0 rounded-full object-cover ring-2 ring-line" />
          ) : (
            <div title="No photo yet" className="flex size-16 shrink-0 items-center justify-center rounded-full bg-subtle text-lg font-semibold text-muted">
              {member.fullName.replace(/^TEST\s+/, "").split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}
            </div>
          )
        }
        actions={
          can("members.write") ? (
            <>
              <SidePanel
                title="Edit details"
                trigger={(open) => (
                  <Button tone="secondary" onClick={open}>
                    <Icon name="edit" className="size-4" /> Edit details
                  </Button>
                )}
              >
                {(close) => (
                  <ActionForm
                    action={async (form) => {
                      setData(
                        await api<MemberDetail>(`/admin/members/${id}`, {
                          method: "PATCH",
                          body: { fullName: text(form, "fullName"), phone: text(form, "phone").replace(/\s/g, ""), email: textOrNull(form, "email"), country: textOrNull(form, "country"), consentMarketing: checked(form, "consentMarketing") },
                        }),
                      );
                      close();
                    }}
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
                        <Checkbox name="consentMarketing" defaultChecked={member.consentMarketing} label="Agreed to marketing messages" />
                        <Button type="submit" disabled={busy}>
                          Save details
                        </Button>
                      </>
                    )}
                  </ActionForm>
                )}
              </SidePanel>
              <SidePanel
                title="Add a membership"
                description="For gifts, client accounts and fixes. Paid passes arrive through checkout."
                trigger={(open) => (
                  <Button onClick={open}>
                    <Icon name="plus" className="size-4" /> Add a membership
                  </Button>
                )}
              >
                {(close) => <AddMembershipForm memberId={id} onChange={(d) => (setData(d), close())} />}
              </SidePanel>
            </>
          ) : null
        }
      />

      <div className="flex flex-col gap-6">
        {memberships.length === 0 ? (
          <Card>
            <EmptyState title="No passes yet">Add a membership to give this member access.</EmptyState>
          </Card>
        ) : null}
        {/* Current passes in full (suspended ones too: they need someone to act); past ones folded away. */}
        {current.map((ms) => (
          <MembershipCard key={ms.id} ms={ms} canWrite={can("members.write")} onChange={setData} testPassHref={member.isTest && ms.status === "active" ? `/members/${member.id}/passes/${ms.id}` : null} />
        ))}
        {past.length ? <PastPasses passes={past} /> : null}

        <DevicesCard memberId={id} canWrite={can("members.write")} />

        <BookingsCard memberId={id} memberships={memberships} canWrite={can("members.write")} />
        {can("payments.read") ? <PaymentsCard memberId={id} canRefund={can("payments.refund")} /> : null}

        <Card title="Visits" description="The last 50 scans at venues, in Lagos time." flush>
          {visits.length === 0 ? (
            <EmptyState title="No visits yet" />
          ) : (
            <Table head={["When", "Listing", "Benefit", "Result", "How", ""]}>
              {visits.map((v) => (
                <tr key={v.id}>
                  <Td className="whitespace-nowrap tabular-nums">{formatLagosDateTime(v.occurredAt)}</Td>
                  <Td>{v.venueName}</Td>
                  <Td>
                    {v.category.name}
                    {v.partySize > 1 ? <span className="text-muted"> · party of {v.partySize}</span> : null}
                  </Td>
                  <Td>
                    {v.reversedAt ? (
                      <Badge dot tone="neutral">
                        Reversed
                      </Badge>
                    ) : v.result === "approved" ? (
                      <Badge dot tone="night">
                        Approved
                      </Badge>
                    ) : (
                      <Badge dot tone="danger">
                        {v.reason ? (DECLINE_LABELS[v.reason] ?? v.reason) : "Declined"}
                      </Badge>
                    )}
                  </Td>
                  <Td className="text-muted">
                    {METHOD[v.method] ?? v.method}
                    {v.vehiclePlate ? <span className="block font-mono text-xs">{v.vehiclePlate}</span> : null}
                  </Td>
                  <Td className="text-right">
                    {can("members.write") && v.result === "approved" && !v.reversedAt ? (
                      <ReasonPanel
                        button="Reverse"
                        title="Reverse this visit"
                        description="For when the service didn't happen: the allowance is given back and any booking is cancelled."
                        confirm="Reverse visit"
                        danger
                        onConfirm={async (reason) => {
                          await api(`/admin/redemptions/${v.id}/reverse`, { method: "POST", body: { reason } });
                          setData(await api<MemberDetail>(`/admin/members/${id}`));
                        }}
                      />
                    ) : null}
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  );
}

/** One benefit's current period; one that resets says when, and how many periods are still to come. */
function AllowanceBar({ a, periods = 1, ahead = 0 }: { a: Allowance; periods?: number; ahead?: number }) {
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
      {periods > 1 ? (
        <p className="mt-1 text-xs text-muted">
          {formatDate(a.periodStart)} – {formatDate(a.periodEnd)} · resets {ahead === 0 ? "no more" : `${ahead} more ${ahead === 1 ? "time" : "times"}`}
        </p>
      ) : null}
      {a.granted ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-subtle" role="presentation">
          <div className={cx("h-full rounded-full", left === 0 ? "bg-danger" : night ? "bg-night" : "bg-day")} style={{ width: `${pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}

function MembershipCard({ ms, canWrite, onChange, testPassHref }: { ms: Membership; canWrite: boolean; onChange: (d: MemberDetail) => void; testPassHref: string | null }) {
  const action = ms.status === "active" ? "suspend" : ms.status === "suspended" ? "reinstate" : null;
  const meta = [
    `${formatDate(ms.startsOn)} – ${formatDate(ms.endsOn)}`,
    ms.arrivesOn ? `Arrives ${formatDate(ms.arrivesOn)}` : null,
    ms.departsOn ? `Departs ${formatDate(ms.departsOn)}` : null,
    ms.client ? `Paid by ${ms.client.name}` : (PAID_BY[ms.paymentSource] ?? ms.paymentSource),
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
          {canWrite && testPassHref ? (
            <Link href={testPassHref} className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-accent hover:bg-subtle">
              TEST pass
            </Link>
          ) : null}
          {canWrite && action ? (
            <SidePanel
              title={action === "suspend" ? "Suspend membership" : "Reinstate membership"}
              description={`${ms.plan.name}${ms.passNumber ? ` · ${ms.passNumber}` : ""}`}
              trigger={(open) => (
                <Button size="sm" tone="secondary" onClick={open}>
                  {action === "suspend" ? "Suspend" : "Reinstate"}
                </Button>
              )}
            >
              {(close) => (
                <ActionForm
                  action={async (form) => {
                    onChange(await api<MemberDetail>(`/admin/memberships/${ms.id}/${action}`, { method: "POST", body: { reason: text(form, "reason") } }));
                    close();
                  }}
                >
                  {(busy) => (
                    <>
                      <Field label="Reason" hint={action === "suspend" ? "Venues will decline this pass until it's reinstated. Kept in the audit log." : "Kept in the audit log."}>
                        <Textarea name="reason" required minLength={3} />
                      </Field>
                      <Button type="submit" tone={action === "suspend" ? "danger" : "primary"} disabled={busy}>
                        {action === "suspend" ? "Suspend membership" : "Reinstate membership"}
                      </Button>
                    </>
                  )}
                </ActionForm>
              )}
            </SidePanel>
          ) : null}
        </>
      }
    >
      {ms.allowances.length === 0 ? (
        <p className="text-sm text-muted">This plan has no benefits.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {currentAllowances(ms.allowances, lagosToday()).map(({ allowance: a, periods, ahead }) => (
            <AllowanceBar key={a.id} a={a} periods={periods} ahead={ahead} />
          ))}
        </div>
      )}
    </Card>
  );
}

function AddMembershipForm({ memberId, onChange }: { memberId: string; onChange: (d: MemberDetail) => void }) {
  const { data } = useApi<{ plans: Plan[] }>("/admin/plans");
  return (
    <ActionForm
      action={async (form) => {
        const body = {
          planId: text(form, "planId"),
          paymentSource: text(form, "paymentSource"),
          ...(text(form, "startsOn") ? { startsOn: text(form, "startsOn") } : {}),
          ...(text(form, "endsOn") ? { endsOn: text(form, "endsOn") } : {}),
          arrivesOn: textOrNull(form, "arrivesOn"),
          departsOn: textOrNull(form, "departsOn"),
          note: text(form, "note") || undefined,
        };
        const add = (allowSamePlan: boolean) => api<MemberDetail>(`/admin/members/${memberId}/memberships`, { method: "POST", body: { ...body, ...(allowSamePlan ? { allowSamePlan } : {}) } });
        try {
          onChange(await add(false));
        } catch (err) {
          // A second current pass on the same plan only on purpose.
          if (!(err instanceof ApiError && err.code === "already_have_plan")) throw err;
          if (!window.confirm("This member already has a current pass on this plan. Add a second one anyway?")) return;
          onChange(await add(true));
        }
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
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Starts" hint="Blank uses the plan's season">
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
          <Field label="Note" hint="Why this was added. Kept in the audit log.">
            <Input name="note" />
          </Field>
          <Button type="submit" disabled={busy}>
            Add membership
          </Button>
        </>
      )}
    </ActionForm>
  );
}

interface Device {
  id: string;
  platform: string;
  createdAt: string;
  revokedAt: string | null;
}

/** Phones holding this member's pass. Revoking one stops its codes everywhere within 15 minutes. */
function DevicesCard({ memberId, canWrite }: { memberId: string; canWrite: boolean }) {
  const { data, reload } = useApi<{ devices: Device[] }>(`/admin/members/${memberId}/devices`);
  if (!data || data.devices.length === 0) return null;
  return (
    <Card title="Devices" description="Phones that can show this member's pass. Revoke one that's lost or stolen: scanners refuse it at once online and within 15 minutes offline." flush>
      <Table head={["Device", "Added", "Status", ""]}>
        {data.devices.map((d) => (
          <tr key={d.id}>
            <Td className="font-mono text-xs">{d.id.slice(0, 8)}</Td>
            <Td className="whitespace-nowrap text-muted">
              {formatLagosDateTime(d.createdAt)} · {d.platform}
            </Td>
            <Td>
              <Badge dot tone={d.revokedAt ? "danger" : "night"}>
                {d.revokedAt ? "Revoked" : "Active"}
              </Badge>
            </Td>
            <Td className="text-right">
              {canWrite && !d.revokedAt ? (
                <ReasonPanel
                  button="Revoke"
                  title="Revoke this device"
                  description="Its codes stop working at once online, and within 15 minutes on offline scanners."
                  confirm="Revoke device"
                  danger
                  onConfirm={async (reason) => {
                    await api(`/admin/devices/${d.id}/revoke`, { method: "POST", body: { reason } });
                    reload();
                  }}
                />
              ) : null}
            </Td>
          </tr>
        ))}
      </Table>
    </Card>
  );
}

const BOOKING_STATUS: Record<Booking["status"], { label: string; tone: "night" | "day" | "neutral" | "danger" }> = {
  requested: { label: "Requested", tone: "day" },
  confirmed: { label: "Confirmed", tone: "night" },
  completed: { label: "Used", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  declined: { label: "Declined", tone: "danger" },
  no_show: { label: "No-show", tone: "danger" },
};

/**
 * Bookings, made by ops on the member's behalf once the partner has agreed. A visiting service
 * (chauffeur, home beauty) only scans against a confirmed booking for the day.
 */
function BookingsCard({ memberId, memberships, canWrite }: { memberId: string; memberships: Membership[]; canWrite: boolean }) {
  const { data, setData } = useApi<{ bookings: Booking[] }>(`/admin/members/${memberId}/bookings`);
  const active = memberships.filter((m) => m.status === "active");

  return (
    <Card
      title="Bookings"
      description="Chauffeurs, home beauty and other visiting services can only be scanned against a confirmed booking for the day."
      flush
      actions={
        canWrite && active.length ? (
          <SidePanel
            title="Book a service"
            description="The partner sees it on their scanner's Today list."
            trigger={(open) => (
              <Button size="sm" tone="secondary" onClick={open}>
                <Icon name="plus" className="size-4" /> Book a service
              </Button>
            )}
          >
            {(close) => <BookingForm memberId={memberId} memberships={active} onBooked={(d) => (setData(d), close())} />}
          </SidePanel>
        ) : null
      }
    >
      {!data || data.bookings.length === 0 ? (
        <EmptyState title="No bookings" />
      ) : (
        <Table head={["Date", "Service", "Status", ""]}>
          {data.bookings.map((b) => (
            <tr key={b.id}>
              <Td className="whitespace-nowrap tabular-nums">{formatDate(b.bookingDate)}</Td>
              <Td>
                <span className="font-medium">{b.venue?.name ?? "–"}</span>
                <span className="block text-xs text-muted">{[b.offerName, tripText(b.trip), b.partySize > 1 ? `party of ${b.partySize}` : null, b.notes, vehicleText(b.vehicle), b.driver ? `Driver: ${b.driver.fullName}` : null].filter(Boolean).join(" · ")}</span>
              </Td>
              <Td>
                <Badge dot tone={BOOKING_STATUS[b.status].tone}>
                  {BOOKING_STATUS[b.status].label}
                </Badge>
              </Td>
              <Td className="text-right">
                {canWrite && b.status === "confirmed" && !b.redemptionId ? (
                  <ReasonPanel
                    button="Cancel"
                    title="Cancel this booking"
                    description={`${b.venue?.name ?? ""} on ${formatDate(b.bookingDate)}`}
                    confirm="Cancel booking"
                    danger
                    onConfirm={async (reason) => setData(await api<{ bookings: Booking[] }>(`/admin/bookings/${b.id}/cancel`, { method: "POST", body: { reason } }))}
                  />
                ) : null}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

function BookingForm({ memberId, memberships, onBooked }: { memberId: string; memberships: Membership[]; onBooked: (d: { bookings: Booking[] }) => void }) {
  const [venueId, setVenueId] = useState("");
  const venues = useApi<{ venues: Venue[] }>("/admin/venues");
  const offers = useApi<{ offers: { id: string; category: { name: string } }[] }>(venueId ? `/admin/venues/${venueId}` : null);
  const sorted = [...(venues.data?.venues ?? [])].filter((v) => v.active).sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "visiting" ? -1 : 1));
  return (
    <ActionForm
      action={async (form) => {
        onBooked(
          await api<{ bookings: Booking[] }>(`/admin/members/${memberId}/bookings`, {
            method: "POST",
            body: {
              membershipId: text(form, "membershipId"),
              venueId: text(form, "venueId"),
              offerId: textOrNull(form, "offerId"),
              bookingDate: text(form, "bookingDate"),
              partySize: Number(text(form, "partySize") || 1),
              notes: textOrNull(form, "notes"),
            },
          }),
        );
      }}
    >
      {(busy) => (
        <>
          <Field label="Pass">
            <Select name="membershipId" required>
              {memberships.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.plan.name}
                  {m.passNumber ? ` · ${m.passNumber}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Listing">
            <Select name="venueId" required value={venueId} onChange={(e) => setVenueId(e.target.value)}>
              <option value="">Choose…</option>
              {sorted.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.kind === "visiting" ? " (visiting)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="What's booked">
            <Select name="offerId">
              <option value="">Any of its offers</option>
              {offers.data?.offers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.category.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date (Lagos)">
              <Input name="bookingDate" type="date" required />
            </Field>
            <Field label="Party size">
              <Input name="partySize" type="number" min={1} max={20} defaultValue={1} />
            </Field>
          </div>
          <Field label="Notes for the partner">
            <Input name="notes" placeholder="e.g. Flight BA75 lands 15:20" />
          </Field>
          <Button type="submit" disabled={busy}>
            Confirm booking
          </Button>
        </>
      )}
    </ActionForm>
  );
}

/** The member's payments, with refunds for finance. */
function PaymentsCard({ memberId, canRefund }: { memberId: string; canRefund: boolean }) {
  const { data, reload } = useApi<{ orders: Order[]; approvalOver: PaymentsOverview["approvalOver"] }>(`/admin/members/${memberId}/orders`);
  const paidOrTried = (data?.orders ?? []).filter((o) => o.status !== "pending" && o.status !== "expired");
  return (
    <Card title="Payments" flush>
      {paidOrTried.length === 0 ? (
        <EmptyState title="No payments" />
      ) : (
        <Table head={["Plan", "Amount", "Status", "When", ""]}>
          {paidOrTried.map((o) => (
            <tr key={o.id}>
              <Td>
                {o.plan.name}
                <span className="block text-xs text-muted">{[o.kind === "renewal" ? "Renewal" : null, PROVIDER_LABELS[o.provider]].filter(Boolean).join(" · ")}</span>
              </Td>
              <Td className="tabular-nums">{formatMoney(o.amountMinor, o.currency)}</Td>
              <Td>
                <Badge dot tone={ORDER_STATUS[o.status].tone}>
                  {ORDER_STATUS[o.status].label}
                </Badge>
                <RefundLines order={o} />
              </Td>
              <Td className="whitespace-nowrap text-muted">{formatLagosDateTime(o.paidAt ?? o.createdAt)}</Td>
              <Td className="text-right">{canRefund && o.refundable > 0 && data ? <RefundPanel order={o} approvalOver={data.approvalOver[o.currency]} onDone={reload} /> : null}</Td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

/** Ended and cancelled passes, one line each, folded away until opened. */
function PastPasses({ passes }: { passes: Membership[] }) {
  return (
    <details className="group rounded-xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-semibold">
        Past and cancelled passes ({passes.length})
        <Icon name="chevron" className="size-4 text-muted transition group-open:rotate-90" />
      </summary>
      <Table head={["Plan", "Dates", "Paid by", "Status"]}>
        {passes.map((ms) => (
          <tr key={ms.id}>
            <Td className="font-medium">
              {ms.plan.name}
              {ms.passNumber ? <span className="block text-xs text-muted">{ms.passNumber}</span> : null}
            </Td>
            <Td className="whitespace-nowrap text-muted">
              {formatDate(ms.startsOn)} – {formatDate(ms.endsOn)}
            </Td>
            <Td className="text-muted">{ms.client ? ms.client.name : (PAID_BY[ms.paymentSource] ?? ms.paymentSource)}</Td>
            <Td>
              <Badge dot tone={statusTone(ms.status)}>
                {ms.status === "active" || ms.status === "suspended" ? "Ended" : (STATUS_LABELS[ms.status] ?? ms.status)}
              </Badge>
            </Td>
          </tr>
        ))}
      </Table>
    </details>
  );
}
