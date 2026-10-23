"use client";
// Payments: money taken by currency, refunds waiting for a second person, failed renewals, and
// every order, which finance can refund.
import { Badge, Button, Card, cx, EmptyState, formatLagosDateTime, formatMoney, Input, PageHeader, StatCard, Table, Td } from "@intu/ui";
import Link from "next/link";
import { useState } from "react";
import { ReasonPanel } from "@/components/reason-panel";
import { ORDER_STATUS, PROVIDER_LABELS, RefundLines, RefundPanel } from "@/components/refunds";
import { api, errorMessage, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import type { Order, PaymentsOverview, RefundToApprove } from "@/lib/types";

const FILTERS: [Order["status"] | "", string][] = [
  ["", "All"],
  ["paid", "Paid"],
  ["pending", "Waiting"],
  ["partially_refunded", "Part refunded"],
  ["refunded", "Refunded"],
  ["failed", "Failed"],
];

export default function PaymentsPage() {
  const { staff, can } = useStaff();
  const [status, setStatus] = useState<Order["status"] | "">("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const params = new URLSearchParams({ ...(status ? { status } : {}), ...(search ? { q: search } : {}) }).toString();
  const { data, error, reload } = useApi<PaymentsOverview>(`/admin/payments${params ? `?${params}` : ""}`);
  const approvals = useApi<{ refunds: RefundToApprove[] }>("/admin/refunds");
  const refunding = can("payments.refund");
  const refresh = () => (reload(), approvals.reload());

  return (
    <>
      <PageHeader title="Payments" subtitle="Passes paid through Stripe (pounds, dollars) and Paystack (naira). Refunds over the set amount need a second person to approve." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {/* Real money only; until there is any, the TEST payments (clearly marked) instead. */}
        {(data ? (data.totals.length ? data.totals : data.testTotals) : []).map((t) => {
          const test = data?.totals.length === 0;
          return (
            <StatCard
              key={t.currency}
              label={`${test ? "TEST payments" : "Taken"} in ${t.currency} this month`}
              value={formatMoney(t.paidThisMonth, t.currency)}
              hint={`${formatMoney(t.paid - t.refunded, t.currency)} in all after ${formatMoney(t.refunded, t.currency)} refunded · ${t.count} payments${test ? " · no real money" : ""}`}
              tone={t.currency === "NGN" ? "day" : "night"}
            />
          );
        })}
        {data && data.totals.length === 0 && data.testTotals.length === 0 ? <StatCard label="Taken so far" value="Nothing yet" /> : null}
      </div>

      {(approvals.data?.refunds.length ?? 0) > 0 ? (
        <Card title="Refunds waiting for approval" description="Someone other than the person who asked must approve or reject each one." className="mb-6" flush>
          <Table head={["Member", "Refund", "Reason", "Asked by", ""]}>
            {approvals.data?.refunds.map((r) => (
              <tr key={r.id}>
                <Td>
                  <Link href={`/members/${r.member.id}`} className="font-semibold text-fg hover:text-accent">
                    {r.member.fullName}
                  </Link>
                  <span className="block text-xs text-muted">
                    {r.plan.name}, paid {formatMoney(r.order.amountMinor, r.order.currency)}
                  </span>
                </Td>
                <Td className="tabular-nums font-semibold">
                  {formatMoney(r.amountMinor, r.currency)}
                  {r.endsPass ? <span className="block text-xs font-normal text-muted">Ends the pass</span> : null}
                </Td>
                <Td className="text-muted">{r.reason}</Td>
                <Td className="text-muted">
                  {r.requestedBy}
                  <span className="block text-xs">{formatLagosDateTime(r.createdAt)}</span>
                </Td>
                <Td className="whitespace-nowrap text-right">
                  {refunding ? (
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        tone="secondary"
                        disabled={r.requestedBy === staff.fullName}
                        onClick={async () => {
                          try {
                            await api(`/admin/refunds/${r.id}/approve`, { method: "POST", body: {} });
                            refresh();
                          } catch (err) {
                            alert(errorMessage(err));
                          }
                        }}
                      >
                        Approve and send
                      </Button>
                      <ReasonPanel button="Reject" title="Reject this refund" description={`${formatMoney(r.amountMinor, r.currency)} to ${r.member.fullName}`} confirm="Reject refund" danger onConfirm={async (note) => (await api(`/admin/refunds/${r.id}/reject`, { method: "POST", body: { note } }), refresh())} />
                    </div>
                  ) : null}
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}

      {(data?.failedRenewals.length ?? 0) > 0 ? (
        <Card title="Failed renewals" description="The provider tries again over the next days; the member sees a note in the app. Their current pass keeps working until it ends." className="mb-6" flush>
          <Table head={["Member", "Plan", "Amount", "Why", "When"]}>
            {data?.failedRenewals.map((f) => (
              <tr key={f.id}>
                <Td>
                  <Link href={`/members/${f.member.id}`} className="font-semibold text-fg hover:text-accent">
                    {f.member.fullName}
                  </Link>
                  <span className="block text-xs text-muted">{f.member.phone}</span>
                </Td>
                <Td>{f.plan.name}</Td>
                <Td className="tabular-nums">{formatMoney(f.amountMinor, f.currency)}</Td>
                <Td className="text-muted">{f.reason ?? "–"}</Td>
                <Td className="text-muted">{f.failedAt ? formatLagosDateTime(f.failedAt) : "–"}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : null}

      <Card
        title="Orders"
        flush
        actions={
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(q.trim());
            }}
          >
            <Input aria-label="Search payments" placeholder="Name, phone or email" value={q} onChange={(e) => setQ(e.target.value)} className="w-56" />
            <Button size="sm" tone="secondary" type="submit">
              Search
            </Button>
          </form>
        }
      >
        <nav aria-label="Order status" className="flex flex-wrap gap-1 border-b border-line px-5 py-3">
          {FILTERS.map(([value, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
              className={cx("rounded-full px-3 py-1 text-sm font-medium", status === value ? "bg-primary text-primary-fg" : "text-muted hover:bg-subtle hover:text-fg")}
            >
              {label}
            </button>
          ))}
        </nav>
        {error ? <p className="p-5 text-sm text-danger">{error}</p> : null}
        {data && data.orders.length === 0 ? (
          <EmptyState title="No payments here" />
        ) : (
          <Table head={["Member", "Plan", "Amount", "Status", "When", ""]}>
            {data?.orders.map((o) => (
              <tr key={o.id}>
                <Td>
                  <Link href={`/members/${o.member.id}`} className="font-semibold text-fg hover:text-accent">
                    {o.member.fullName}
                  </Link>
                  <span className="block text-xs text-muted">{o.member.phone}</span>
                </Td>
                <Td>
                  {o.plan.name}
                  <span className="block text-xs text-muted">{[o.kind === "renewal" ? "Renewal" : null, PROVIDER_LABELS[o.provider], o.isTest ? "TEST" : null].filter(Boolean).join(" · ")}</span>
                </Td>
                <Td className="tabular-nums">{formatMoney(o.amountMinor, o.currency)}</Td>
                <Td>
                  <Badge dot tone={ORDER_STATUS[o.status].tone}>
                    {ORDER_STATUS[o.status].label}
                  </Badge>
                  {o.failureReason ? <span className="block text-xs text-danger">{o.failureReason}</span> : null}
                  <RefundLines order={o} />
                </Td>
                <Td className="whitespace-nowrap text-muted">{formatLagosDateTime(o.paidAt ?? o.createdAt)}</Td>
                <Td className="text-right">{refunding && o.refundable > 0 && data ? <RefundPanel order={o} approvalOver={data.approvalOver[o.currency]} onDone={refresh} /> : null}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
