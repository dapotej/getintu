"use client";
// One partner statement: each visit behind the total, finance's adjustments, visits held off it,
// and the steps to approve and pay it. Buttons say why when they can't be used.
import { Badge, Button, Card, DetailList, EmptyState, Field, formatDate, formatLagosDateTime, formatMoney, Icon, Input, Notice, PageHeader, parseMajorToMinor, Select, SidePanel, Table, Td, Textarea } from "@intu/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ActionForm, text } from "@/components/forms";
import { ReasonPanel } from "@/components/reason-panel";
import { monthLabel, SETTLEMENT_STATUS } from "@/components/settlements";
import { api, errorMessage, useApi } from "@/lib/api";
import { useStaff } from "@/lib/auth";
import type { SettlementDetail } from "@/lib/types";

const METHOD: Record<string, string> = { online: "Scanned", offline: "Scanned offline", manual: "Backup code" };

export default function SettlementPage() {
  const { id } = useParams<{ id: string }>();
  const { can } = useStaff();
  const { data, error, reload } = useApi<SettlementDetail>(`/admin/settlements/${id}`);
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <p className="text-sm text-muted">Loading…</p>;
  const { settlement: s, partner, lines, adjustments, held } = data;
  const draft = s.status === "draft";
  const writable = can("settlements.write");
  const paying = can("settlements.pay");
  const post = async (path: string, body: unknown = {}) => {
    try {
      await api(`/admin/settlements/${id}${path}`, { method: "POST", body });
    } catch (err) {
      alert(errorMessage(err));
    }
    reload();
  };
  const adjustmentsTotal = adjustments.reduce((n, a) => n + a.amountMinor, 0);

  return (
    <>
      <PageHeader
        eyebrow={
          <Link href="/settlements" className="inline-flex items-center gap-1 hover:text-fg">
            <Icon name="back" className="size-4" /> Statements
          </Link>
        }
        title={`${partner.tradingName}: ${monthLabel(s.periodStart)}`}
        subtitle={`${formatDate(s.periodStart)} to ${formatDate(s.periodEnd)}${s.isTest ? "  ·  TEST" : ""}`}
        actions={
          <Badge dot tone={SETTLEMENT_STATUS[s.status].tone}>
            {SETTLEMENT_STATUS[s.status].label}
          </Badge>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <div className="flex flex-col gap-6">
          <Card title={`Visits (${lines.length})`} description="Approved visits, each at its offer's rate when it joined the statement (times the party size when the benefit counts per person)." flush>
            {lines.length === 0 ? (
              <EmptyState title="No visits on this statement" />
            ) : (
              <Table head={["When", "Member", "Where", "Amount", ""]}>
                {lines.map((l) => (
                  <tr key={l.id}>
                    <Td className="whitespace-nowrap text-muted">
                      {formatLagosDateTime(l.occurredAt)}
                      <span className="block text-xs">{METHOD[l.method] ?? l.method}{l.flagged ? " · reviewed flag" : ""}</span>
                    </Td>
                    <Td>
                      {l.member}
                      {l.partySize > 1 ? <span className="block text-xs text-muted">Party of {l.partySize}</span> : null}
                    </Td>
                    <Td>
                      {l.venue}
                      <span className="block text-xs text-muted">{l.service}</span>
                    </Td>
                    <Td className="tabular-nums">{formatMoney(l.amountMinor, s.currency)}</Td>
                    <Td className="text-right">
                      {draft && writable ? (
                        <ReasonPanel
                          button="Hold"
                          title="Hold this visit"
                          description={`Takes ${formatMoney(l.amountMinor, s.currency)} off this statement and keeps the visit off statements until it's released, e.g. while a dispute is looked into.`}
                          confirm="Hold visit"
                          onConfirm={(reason) => post(`/lines/${l.id}/hold`, { reason })}
                        />
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          <Card
            title="Adjustments"
            description="Lines added by hand: a flat monthly fee (doctor on call, unlimited gym), a correction or goodwill. Take money off with a minus amount."
            flush
            actions={
              draft && writable ? (
                <SidePanel
                  title="Add an adjustment"
                  trigger={(open) => (
                    <Button size="sm" tone="secondary" onClick={open}>
                      <Icon name="plus" className="size-4" /> Add adjustment
                    </Button>
                  )}
                >
                  {(close) => (
                    <ActionForm
                      action={async (form) => {
                        const amount = parseMajorToMinor(text(form, "amount"));
                        if (!amount) throw new Error("Enter an amount in naira, e.g. 50000");
                        const sign = text(form, "direction") === "minus" ? -1 : 1;
                        await api(`/admin/settlements/${id}/adjustments`, { method: "POST", body: { amountMinor: sign * amount, reason: text(form, "reason") } });
                        reload();
                        close();
                      }}
                    >
                      {(busy) => (
                        <>
                          <Field label="Add or take off">
                            <Select name="direction" defaultValue="plus">
                              <option value="plus">Add to what intu owes</option>
                              <option value="minus">Take off what intu owes</option>
                            </Select>
                          </Field>
                          <Field label="Amount (₦)">
                            <Input name="amount" required inputMode="decimal" placeholder="50000" className="w-44" />
                          </Field>
                          <Field label="Reason" hint="The partner sees this on their statement.">
                            <Textarea name="reason" required minLength={3} />
                          </Field>
                          <Button type="submit" disabled={busy}>
                            Add adjustment
                          </Button>
                        </>
                      )}
                    </ActionForm>
                  )}
                </SidePanel>
              ) : null
            }
          >
            {adjustments.length === 0 ? (
              <EmptyState title="No adjustments" />
            ) : (
              <Table head={["Reason", "By", "Amount", ""]}>
                {adjustments.map((a) => (
                  <tr key={a.id}>
                    <Td>{a.reason}</Td>
                    <Td className="text-muted">
                      {a.createdBy}
                      <span className="block text-xs">{formatLagosDateTime(a.createdAt)}</span>
                    </Td>
                    <Td className="tabular-nums">{formatMoney(a.amountMinor, s.currency)}</Td>
                    <Td className="text-right">
                      {draft && writable ? (
                        <Button
                          size="sm"
                          tone="ghost"
                          onClick={async () => {
                            if (!confirm("Remove this adjustment?")) return;
                            try {
                              await api(`/admin/settlements/${id}/adjustments/${a.id}`, { method: "DELETE" });
                            } catch (err) {
                              alert(errorMessage(err));
                            }
                            reload();
                          }}
                        >
                          Remove
                        </Button>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>

          {held.length > 0 ? (
            <Card title={`Held visits (${held.length})`} description={`${partner.tradingName}'s visits kept off statements. Released visits go on the next statement built.`} flush>
              <Table head={["Date", "Member", "Where", "Why", ""]}>
                {held.map((h) => (
                  <tr key={h.id}>
                    <Td className="whitespace-nowrap text-muted">{formatDate(h.serviceDate)}</Td>
                    <Td>{h.member}</Td>
                    <Td>
                      {h.venue}
                      <span className="block text-xs text-muted">{h.service}</span>
                    </Td>
                    <Td className="text-muted">{h.reason}</Td>
                    <Td className="text-right">
                      {writable ? (
                        <Button
                          size="sm"
                          tone="ghost"
                          onClick={async () => {
                            try {
                              await api(`/admin/redemptions/${h.id}/release-hold`, { method: "POST", body: {} });
                            } catch (err) {
                              alert(errorMessage(err));
                            }
                            reload();
                          }}
                        >
                          Release
                        </Button>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </Table>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-6">
          <Card title="Total">
            <p className="text-3xl font-bold tabular-nums">{formatMoney(s.totalMinor, s.currency)}</p>
            <p className="mt-1 text-sm text-muted">
              {formatMoney(s.linesMinor, s.currency)} from {s.lineCount} visit{s.lineCount === 1 ? "" : "s"}
              {adjustments.length ? `, ${adjustmentsTotal >= 0 ? "plus" : "less"} ${formatMoney(Math.abs(adjustmentsTotal), s.currency)} in adjustments` : ""}
            </p>
            <div className="mt-4">
              <DetailList
                items={[
                  ["Last changed by", s.changedBy ?? (s.changedById ? "Someone" : "The monthly run")],
                  ["Approved by", s.approvedBy ? `${s.approvedBy}${s.approvedAt ? `, ${formatLagosDateTime(s.approvedAt)}` : ""}` : "Not yet"],
                  ["Paid", s.paidAt ? `${formatLagosDateTime(s.paidAt)}${s.paidBy ? ` by ${s.paidBy}` : ""}` : "Not yet"],
                  ["Payment reference", s.paymentReference],
                ]}
              />
            </div>
          </Card>

          <Card title="Next step">
            <div className="flex flex-col gap-3">
              {s.status === "failed" && s.failureReason ? <Notice>{s.failureReason}</Notice> : null}
              {s.status === "void" ? <p className="text-sm text-muted">Voided: {s.voidReason}. Its visits go on the next statement built.</p> : null}
              {s.status === "paid" ? <p className="text-sm text-muted">Paid. Nothing more to do.</p> : null}
              {s.status === "paying" ? (
                <>
                  <p className="text-sm text-muted">The transfer is with Paystack. This page checks with Paystack each time it opens; it usually clears within minutes.</p>
                  <Button tone="secondary" onClick={() => reload()}>
                    Check again
                  </Button>
                </>
              ) : null}

              {draft ? (
                <>
                  <Button disabled={!data.canApprove.ok} onClick={() => confirm(`Approve ${formatMoney(s.totalMinor, s.currency)} for ${partner.tradingName}?`) && post("/approve")}>
                    Approve for payout
                  </Button>
                  {!data.canApprove.ok ? <p className="text-xs text-muted">{data.canApprove.message}</p> : null}
                </>
              ) : null}

              {(s.status === "approved" || s.status === "failed") && paying ? (
                <>
                  <Button disabled={!data.canPay.ok} onClick={() => confirm(`Send ${formatMoney(s.totalMinor, s.currency)} to ${partner.payoutAccount?.accountName ?? partner.tradingName} by Paystack transfer?`) && post("/pay")}>
                    {s.status === "failed" ? "Send the transfer again" : "Pay by Paystack transfer"}
                  </Button>
                  {!data.canPay.ok ? <p className="text-xs text-muted">{data.canPay.message}</p> : null}
                  <SidePanel
                    title="Record a payment made another way"
                    description="For a transfer sent from the bank instead of Paystack. Record the bank's reference."
                    trigger={(open) => (
                      <Button tone="ghost" onClick={open}>
                        Record a payment made another way
                      </Button>
                    )}
                  >
                    {(close) => (
                      <ActionForm
                        action={async (form) => {
                          await api(`/admin/settlements/${id}/record-paid`, { method: "POST", body: { reference: text(form, "reference") } });
                          reload();
                          close();
                        }}
                      >
                        {(busy) => (
                          <>
                            <Field label="Bank reference">
                              <Input name="reference" required minLength={3} />
                            </Field>
                            <Button type="submit" disabled={busy}>
                              Mark as paid
                            </Button>
                          </>
                        )}
                      </ActionForm>
                    )}
                  </SidePanel>
                </>
              ) : null}

              {writable && (s.status === "approved" || s.status === "failed") ? (
                <ReasonPanel button="Send back to draft" title="Send back to draft" description="To change it. It needs approving again." confirm="Send back" onConfirm={(reason) => post("/send-back", { reason })} />
              ) : null}
              {writable && (draft || s.status === "approved" || s.status === "failed") ? (
                <ReasonPanel button="Void statement" title="Void this statement" description="Cancels it. Its visits go on the next statement built for this partner." confirm="Void statement" danger onConfirm={(reason) => post("/void", { reason })} />
              ) : null}
            </div>
          </Card>

          <Card title="Paid to">
            {partner.payoutAccount ? (
              <DetailList
                items={[
                  ["Account name", partner.payoutAccount.accountName],
                  ["Bank", partner.payoutAccount.bankName],
                  ["Account", `•••• ${partner.payoutAccount.accountLast4 ?? ""}`],
                ]}
              />
            ) : (
              <p className="text-sm text-muted">No bank account yet.</p>
            )}
            <Link href={`/partners/${partner.id}`} className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
              {partner.payoutAccount ? "Change on the partner's page" : "Add it on the partner's page"}
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}
