"use client";
import { Badge, Button, Card, cx, DECLINE_LABELS, EmptyState, Field, formatLagosDateTime, Input, PageHeader } from "@intu/ui";
import Link from "next/link";
import { useState } from "react";
import { ActionForm, text } from "@/components/forms";
import { api, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";

interface FlaggedVisit {
  id: string;
  occurredAt: string;
  method: "online" | "offline" | "manual";
  partySize: number;
  flagReason: string | null;
  flagReviewedAt: string | null;
  flagReviewNote: string | null;
  member: { id: string; fullName: string };
  venue: { id: string; name: string; partnerId: string };
  offerName: string;
}

const METHOD = { online: "Scan", offline: "Offline scan", manual: "Backup code" };
/** Rule codes in a flag reason, in words staff use: ALLOWANCE_USED_UP → "used up". */
const readable = (reason: string | null) => (reason ?? "").replace(/\b[A-Z][A-Z_]{5,}\b/g, (code) => (DECLINE_LABELS[code] ? DECLINE_LABELS[code].toLowerCase() : code));

/** Offline visits that broke a rule once synced, and visits a venue reported. Nothing is reversed: ops decides. */
export default function VisitsToReviewPage() {
  const { can } = useStaff();
  const [status, setStatus] = useState<"open" | "reviewed">("open");
  const { data, error, reload } = useApi<{ redemptions: FlaggedVisit[] }>(`/admin/redemptions?status=${status}`);
  const [reviewing, setReviewing] = useState<string | null>(null);

  return (
    <>
      <PageHeader title="Visits to review" subtitle="Offline approvals that broke a rule when they synced, and problems venues reported. The member was let in; decide what happens next and note it here." />
      <div role="group" aria-label="Show" className="mb-4 flex gap-2">
        {(["open", "reviewed"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={cx("rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset", status === s ? "bg-primary text-primary-fg ring-primary" : "bg-surface text-muted ring-line hover:text-fg")}
          >
            {s === "open" ? "To review" : "Reviewed"}
          </button>
        ))}
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      {data && data.redemptions.length === 0 ? (
        <Card>
          <EmptyState title={status === "open" ? "Nothing to review" : "Nothing reviewed yet"} />
        </Card>
      ) : null}
      <div className="flex flex-col gap-3">
        {data?.redemptions.map((v) => (
          <Card key={v.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold">
                  <Link href={`/members/${v.member.id}`} className="hover:text-accent">
                    {v.member.fullName}
                  </Link>{" "}
                  <span className="font-normal text-muted">at</span>{" "}
                  <Link href={`/partners/${v.venue.partnerId}/venues/${v.venue.id}`} className="hover:text-accent">
                    {v.venue.name}
                  </Link>
                </p>
                <p className="mt-0.5 text-sm text-muted">
                  {formatLagosDateTime(v.occurredAt)} · {v.offerName}
                  {v.partySize > 1 ? ` · party of ${v.partySize}` : ""} · {METHOD[v.method]}
                </p>
                <p className="mt-2 text-sm">{readable(v.flagReason)}</p>
                {v.flagReviewNote ? (
                  <p className="mt-2 text-sm text-muted">
                    Reviewed {v.flagReviewedAt ? formatLagosDateTime(v.flagReviewedAt) : ""}: {v.flagReviewNote}
                  </p>
                ) : null}
              </div>
              {status === "open" ? (
                <Badge dot tone="day">
                  To review
                </Badge>
              ) : (
                <Badge dot tone="night">
                  Reviewed
                </Badge>
              )}
            </div>
            {status === "open" && can("members.write") ? (
              reviewing === v.id ? (
                <ActionForm
                  className="mt-4 flex flex-wrap items-end gap-3"
                  action={async (form) => {
                    await api(`/admin/redemptions/${v.id}/review`, { method: "POST", body: { note: text(form, "note") } });
                    setReviewing(null);
                    reload();
                  }}
                >
                  {(busy) => (
                    <>
                      <div className="min-w-64 flex-1">
                        <Field label="What was decided" hint="Kept in the audit log">
                          <Input name="note" required minLength={3} placeholder="e.g. Venue paid; member reminded of the daily limit" />
                        </Field>
                      </div>
                      <Button type="submit" disabled={busy}>
                        Mark reviewed
                      </Button>
                      <Button type="button" tone="ghost" onClick={() => setReviewing(null)}>
                        Cancel
                      </Button>
                    </>
                  )}
                </ActionForm>
              ) : (
                <div className="mt-4">
                  <Button size="sm" tone="secondary" onClick={() => setReviewing(v.id)}>
                    Review
                  </Button>
                </div>
              )
            ) : null}
          </Card>
        ))}
      </div>
    </>
  );
}
