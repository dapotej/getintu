"use client";
// The concierge's booking queue: requests from the member app, confirmed once the venue has agreed
// or declined with a reason; and the confirmed bookings coming up.
import { Badge, Button, Card, cx, EmptyState, formatDate, PageHeader, Table, Td } from "@intu/ui";
import Link from "next/link";
import { useState } from "react";
import { ReasonPanel } from "@/components/reason-panel";
import { api, errorMessage, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import { tripText } from "@/lib/labels";
import type { QueuedBooking } from "@/lib/types";

export default function BookingsPage() {
  const { can } = useStaff();
  const [status, setStatus] = useState<"requested" | "confirmed">("requested");
  const { data, error, loading, reload } = useApi<{ bookings: QueuedBooking[] }>(`/admin/bookings?status=${status}`);
  const answering = can("bookings.manage") && status === "requested";

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
          <Table head={["Date", "Member", "Venue", "Party", answering ? "" : null].filter((h) => h !== null)}>
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
                </Td>
                <Td className="tabular-nums">{b.partySize}</Td>
                {answering ? (
                  <Td className="whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        tone="secondary"
                        onClick={async () => {
                          try {
                            await api(`/admin/bookings/${b.id}/confirm`, { method: "POST", body: {} });
                            reload();
                          } catch (err) {
                            alert(errorMessage(err));
                          }
                        }}
                      >
                        Confirm
                      </Button>
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
