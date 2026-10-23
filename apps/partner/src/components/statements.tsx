"use client";
// Managers' Statements tab (spec: Partner app portal, Money): each month intu has approved, what
// it comes to, whether it's paid, and the visits behind it. Members appear by name only.
import { cx, formatMoney, Notice } from "@intu/ui";
import { useEffect, useState } from "react";
import { api, NoSignal } from "@/lib/api";
import type { PartnerStatement, PartnerStatementDetail } from "@/lib/types";

const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const month = (date: string) => monthName.format(new Date(`${date}T00:00:00Z`));
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Lagos" });

export function StatementsTab({ token, online }: { token: string; online: boolean }) {
  const [list, setList] = useState<PartnerStatement[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ statements: PartnerStatement[] }>("/partner/statements", { token })
      .then((r) => (setList(r.statements), setError(null)))
      .catch((err) => setError(err instanceof NoSignal ? "Statements need signal." : err instanceof Error ? err.message : "Couldn't load statements"));
  }, [token, online]);

  if (open) return <Statement id={open} token={token} onBack={() => setOpen(null)} />;
  return (
    <div className="flex flex-col gap-3">
      {error ? <Notice tone="warning">{error}</Notice> : null}
      <p className="text-sm text-muted">Each month&apos;s visits, at your agreed rates, once intu has approved them. Payment goes to your bank account on file.</p>
      {list && list.length === 0 ? <p className="text-sm text-muted">No statements yet. The first appears after the end of your first month with intu members.</p> : null}
      <ul className="flex flex-col gap-2">
        {list?.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => setOpen(s.id)} className="w-full rounded-xl bg-surface px-4 py-3 text-left ring-1 ring-line">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">{month(s.periodStart)}</p>
                <p className="font-semibold tabular-nums">{formatMoney(s.totalMinor, s.currency)}</p>
              </div>
              <p className="text-sm text-muted">
                {s.visits} visit{s.visits === 1 ? "" : "s"} ·{" "}
                <span className={cx("font-semibold", s.status === "paid" ? "text-night" : "text-day")}>{s.status === "paid" ? `Paid ${s.paidAt ? day(s.paidAt) : ""}` : "Approved, payment on its way"}</span>
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Statement({ id, token, onBack }: { id: string; token: string; onBack: () => void }) {
  const [data, setData] = useState<PartnerStatementDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<PartnerStatementDetail>(`/partner/statements/${id}`, { token })
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load the statement"));
  }, [id, token]);
  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="self-start text-sm font-semibold text-accent">
        ← All statements
      </button>
      {error ? <Notice tone="warning">{error}</Notice> : null}
      {data ? (
        <>
          <section className="rounded-xl bg-surface px-4 py-4 ring-1 ring-line">
            <h2 className="text-lg font-bold">{month(data.statement.periodStart)}</h2>
            <p className="mt-1 text-3xl font-bold tabular-nums">{formatMoney(data.statement.totalMinor, data.statement.currency)}</p>
            <p className={cx("mt-1 text-sm font-semibold", data.statement.status === "paid" ? "text-night" : "text-day")}>
              {data.statement.status === "paid" ? `Paid ${data.statement.paidAt ? day(data.statement.paidAt) : ""}${data.statement.paymentReference ? ` · ref ${data.statement.paymentReference}` : ""}` : "Approved, payment on its way"}
            </p>
          </section>
          {data.adjustments.length ? (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-muted">Adjustments</h3>
              <ul className="flex flex-col gap-2">
                {data.adjustments.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3 rounded-xl bg-surface px-4 py-3 ring-1 ring-line">
                    <span>{a.reason}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{formatMoney(a.amountMinor, data.statement.currency)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section>
            <h3 className="mb-2 text-sm font-semibold text-muted">
              Visits · {formatMoney(data.statement.linesMinor, data.statement.currency)}
            </h3>
            <ul className="flex flex-col gap-2">
              {data.lines.map((l) => (
                <li key={l.id} className="rounded-xl bg-surface px-4 py-3 ring-1 ring-line">
                  <div className="flex items-start justify-between gap-3">
                    <p className="truncate font-semibold">{l.member}</p>
                    <p className="shrink-0 font-semibold tabular-nums">{formatMoney(l.amountMinor, data.statement.currency)}</p>
                  </div>
                  <p className="text-sm text-muted">
                    {day(l.occurredAt)} · {l.service}
                    {l.partySize > 1 ? ` · party of ${l.partySize}` : ""} · {l.venue}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
