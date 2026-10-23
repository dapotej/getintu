"use client";
// Partner statements: what intu owes each partner for a month, built from approved visits. Finance
// builds and adjusts them, a payout approver who didn't change one approves it, and it's paid by
// Paystack transfer.
import { Badge, Button, Card, cx, EmptyState, formatMoney, Input, Notice, PageHeader, Table, Td } from "@intu/ui";
import Link from "next/link";
import { useState } from "react";
import { monthLabel, SETTLEMENT_STATUS } from "@/components/settlements";
import { api, errorMessage, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import type { SettlementRow, SettlementStatus } from "@/lib/types";

const FILTERS: [SettlementStatus | "", string][] = [
  ["", "All"],
  ["draft", "Drafts"],
  ["approved", "To pay"],
  ["paying", "Transfer sent"],
  ["failed", "Failed"],
  ["paid", "Paid"],
  ["void", "Void"],
];

export default function SettlementsPage() {
  const { can, staff } = useStaff();
  const [status, setStatus] = useState<SettlementStatus | "">("");
  const { data, error, reload } = useApi<{ lastMonth: string; settlements: SettlementRow[]; held: number }>(`/admin/settlements${status ? `?status=${status}` : ""}`);
  const [month, setMonth] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const chosen = month ?? data?.lastMonth ?? "";

  async function build() {
    setBusy(true);
    setResult(null);
    try {
      const res = await api<{ statements: { created: boolean; added: number }[]; waiting: { visits: number }[] }>("/admin/settlements/run", { method: "POST", body: { month: chosen } });
      const made = res.statements.filter((s) => s.created).length;
      const added = res.statements.reduce((n, s) => n + s.added, 0);
      const waiting = res.waiting.reduce((n, w) => n + w.visits, 0);
      setResult(
        res.statements.length === 0 && waiting === 0
          ? `No new visits to put on ${monthLabel(chosen)} statements.`
          : `${monthLabel(chosen)}: ${made} new statement${made === 1 ? "" : "s"}, ${added} visit${added === 1 ? "" : "s"} added.${waiting ? ` ${waiting} late visit${waiting === 1 ? "" : "s"} for partners already approved will go on next month's statement.` : ""}`,
      );
      reload();
    } catch (err) {
      setResult(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Statements"
        subtitle="What intu owes each partner for a month, from approved visits at each offer's rate. Built as drafts on the 1st; someone who can approve payouts, and didn't change the statement, approves it before it's paid."
      />
      {can("settlements.write") ? (
        <Card title="Build statements" description="Adds every approved visit up to the end of the month that isn't on a statement yet. Running it again only adds new visits." className="mb-6">
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void build();
            }}
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Month</span>
              <Input type="month" aria-label="Month" value={chosen} onChange={(e) => setMonth(e.target.value)} required className="w-44" />
            </label>
            <Button type="submit" disabled={busy || !chosen}>
              {busy ? "Building…" : `Build ${chosen ? monthLabel(chosen) : ""} statements`}
            </Button>
          </form>
          {result ? <p className="mt-3 text-sm text-muted">{result}</p> : null}
        </Card>
      ) : null}
      {data && data.held > 0 ? (
        <div className="mb-6">
          <Notice tone="warning">
            {data.held} visit{data.held === 1 ? " is" : "s are"} held off statements. Release them from the partner&apos;s statement page when they&apos;re sorted out.
          </Notice>
        </div>
      ) : null}
      {!staff.canApprovePayouts ? <p className="mb-4 text-sm text-muted">You can see statements but not approve payouts. A team lead can switch that on for you in Settings → Team.</p> : null}

      <Card title="All statements" flush>
        <nav aria-label="Statement status" className="flex flex-wrap gap-1 border-b border-line px-5 py-3">
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
        {data && data.settlements.length === 0 ? (
          <EmptyState title="No statements here">Build last month&apos;s statements above, or wait for the 1st.</EmptyState>
        ) : (
          <Table head={["Partner", "Month", "Visits", "Total", "Status", ""]}>
            {data?.settlements.map((s) => (
              <tr key={s.id}>
                <Td>
                  <Link href={`/settlements/${s.id}`} className="font-semibold text-fg hover:text-accent">
                    {s.partner.tradingName}
                  </Link>
                  {s.isTest ? <span className="block text-xs text-muted">TEST</span> : null}
                </Td>
                <Td className="whitespace-nowrap">{monthLabel(s.periodStart)}</Td>
                <Td className="tabular-nums">{s.lineCount}</Td>
                <Td className="tabular-nums font-semibold">{formatMoney(s.totalMinor, s.currency)}</Td>
                <Td>
                  <Badge dot tone={SETTLEMENT_STATUS[s.status].tone}>
                    {SETTLEMENT_STATUS[s.status].label}
                  </Badge>
                  <span className="block text-xs text-muted">{s.approvedBy ? `Approved by ${s.approvedBy}` : s.changedBy ? `Last changed by ${s.changedBy}` : s.status === "draft" ? "Built by the monthly run" : ""}</span>
                </Td>
                <Td className="text-right">
                  <Link href={`/settlements/${s.id}`} className="text-sm font-medium text-accent hover:underline">
                    Open
                  </Link>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
