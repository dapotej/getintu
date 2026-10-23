"use client";
// The concierge's booking queue: requests from the member app, confirmed once the venue has agreed
// or declined with a reason; and the confirmed bookings coming up.
import { Badge, Button, Card, cx, EmptyState, formatDate, PageHeader, SidePanel, Table, Td } from "@intu/ui";
import Link from "next/link";
import { useState } from "react";
import { ActionForm } from "@/components/forms";
import { ReasonPanel } from "@/components/reason-panel";
import { AssignFields, readAssignment } from "@/components/vehicles";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import { tripText, vehicleText } from "@/lib/labels";
import type { QueuedBooking } from "@/lib/types";

export default function BookingsPage() {
  const { can } = useStaff();
  const [status, setStatus] = useState<"requested" | "confirmed">("requested");
  const { data, error, loading, reload } = useApi<{ bookings: QueuedBooking[] }>(`/admin/bookings?status=${status}`);
  const managing = can("bookings.manage");
  const answering = managing && status === "requested";

  return (
    <>
      <PageHeader title="Bookings" subtitle="Requests from the member app. Confirm once the venue has agreed; members see the answer in the app." />
      <nav aria-label="Bookings" className="mb-6 flex gap-1 border-b border-line">
        {(["requested", "confirmed"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-current={status === s ? "page" : undefined}
            onClick={() => setStatus(s)}
            className={cx("-mb-px border-b-2 px-3 py-2 text-sm font-semibold", status === s ? "border-primary text-fg" : "border-transparent text-muted hover:text-fg")}
          >
            {s === "requested" ? "Requests" : "Confirmed, coming up"}
          </button>
        ))}
      </nav>
      <Card flush>
        {error ? <p className="p-5 text-sm text-danger">{error}</p> : null}
        {!loading && data?.bookings.length === 0 ? (
          <EmptyState title={status === "requested" ? "No requests waiting" : "Nothing confirmed coming up"} />
        ) : (
          <Table head={["Date", "Member", "Listing", "Party", managing ? "" : null].filter((h) => h !== null)}>
            {data?.bookings.map((b) => (
              <tr key={b.id}>
                <Td className="whitespace-nowrap tabular-nums">{formatDate(b.bookingDate)}</Td>
                <Td>
                  <Link href={`/members/${b.member.id}`} className="font-semibold text-fg hover:text-accent">
                    {b.member.fullName}
                  </Link>
                  <span className="block text-xs text-muted">{b.member.phone}</span>
                </Td>
                <Td>
                  {b.venue ? (
                    <Link href={`/partners/${b.venue.partnerId}/venues/${b.venue.id}`} className="font-medium text-fg hover:text-accent">
                      {b.venue.name}
                    </Link>
                  ) : (
                    "–"
                  )}
                  <span className="block text-xs text-muted">{[b.offerName, tripText(b.trip), b.notes].filter(Boolean).join(" · ") || null}</span>
                  {b.vehicle || b.driver ? <span className="block text-xs text-muted">{[vehicleText(b.vehicle), b.driver ? `Driver: ${b.driver.fullName}` : null].filter(Boolean).join(" · ")}</span> : null}
                </Td>
                <Td className="tabular-nums">{b.partySize}</Td>
                {answering ? (
                  <Td className="whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1">
                      <SidePanel
                        title="Confirm this request"
                        description={`${b.member.fullName}, ${b.venue?.name ?? ""} on ${formatDate(b.bookingDate)}`}
                        trigger={(open) => (
                          <Button size="sm" tone="secondary" onClick={open}>
                            Confirm
                          </Button>
                        )}
                      >
                        {(close) => (
                          <ActionForm
                            action={async (form) => {
                              await api(`/admin/bookings/${b.id}/confirm`, { method: "POST", body: readAssignment(form) });
                              close();
                              reload();
                            }}
                          >
                            {(busy) => (
                              <>
                                <p className="text-sm text-muted">Confirm once the listing has agreed. The member sees it in the app.</p>
                                {b.venue ? <AssignFields venueId={b.venue.id} current={b} /> : null}
                                <Button type="submit" disabled={busy}>
                                  Confirm booking
                                </Button>
                              </>
                            )}
                          </ActionForm>
                        )}
                      </SidePanel>
                      <ReasonPanel
                        button="Decline"
                        title="Decline this request"
                        description={`${b.member.fullName}, ${b.venue?.name ?? ""} on ${formatDate(b.bookingDate)}`}
                        confirm="Decline request"
                        hint="Why it can't happen, e.g. the venue is full. Kept in the audit log."
                        danger
                        onConfirm={async (note) => {
                          await api(`/admin/bookings/${b.id}/decline`, { method: "POST", body: { note } });
                          reload();
                        }}
                      />
                    </div>
                  </Td>
                ) : managing && b.venue?.kind === "visiting" ? (
                  <Td className="whitespace-nowrap text-right">
                    <SidePanel
                      title="Car and driver"
                      description={`${b.member.fullName}, ${b.venue.name} on ${formatDate(b.bookingDate)}`}
                      trigger={(open) => (
                        <Button size="sm" tone="ghost" onClick={open}>
                          Car and driver
                        </Button>
                      )}
                    >
                      {(close) => (
                        <ActionForm
                          action={async (form) => {
                            const assignment = readAssignment(form);
                            if (!("vehicleId" in assignment)) throw new Error("This listing has no vehicles. Add them on the listing's page.");
                            await api(`/admin/bookings/${b.id}/assign`, { method: "POST", body: assignment });
                            close();
                            reload();
                          }}
                        >
                          {(busy) => (
                            <>
                              <AssignFields venueId={b.venue?.id ?? ""} current={b} />
                              <Button type="submit" disabled={busy}>
                                Save
                              </Button>
                            </>
                          )}
                        </ActionForm>
                      )}
                    </SidePanel>
                  </Td>
                ) : managing ? (
                  <Td>{null}</Td>
                ) : null}
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {status === "confirmed" ? (
        <p className="mt-3 text-sm text-muted">
          <Badge>Tip</Badge> To cancel a confirmed booking, open the member.
        </p>
      ) : null}
    </>
  );
}
