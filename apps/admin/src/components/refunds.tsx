"use client";
// Refunding a payment: how much, why, and whether the pass ends. Above the set amount it waits for
// a second person (shown before it's sent), so the panel says which will happen.
import { Badge, Button, Checkbox, Field, formatLagosDateTime, formatMoney, Input, minorToMajorInput, parseMajorToMinor, SidePanel, Textarea } from "@intu/ui";
import { ActionForm, checked, text } from "@/components/forms";
import { api } from "@/lib/api";
import type { Order, Refund } from "@/lib/types";

export const ORDER_STATUS: Record<Order["status"], { label: string; tone: "day" | "night" | "danger" | "neutral" }> = {
  pending: { label: "Waiting for payment", tone: "day" },
  paid: { label: "Paid", tone: "night" },
  failed: { label: "Failed", tone: "danger" },
  expired: { label: "Not finished", tone: "neutral" },
  refunded: { label: "Refunded", tone: "neutral" },
  partially_refunded: { label: "Part refunded", tone: "night" },
};

export const REFUND_STATUS: Record<Refund["status"], { label: string; tone: "day" | "night" | "danger" | "neutral" }> = {
  awaiting_approval: { label: "Waiting for approval", tone: "day" },
  rejected: { label: "Rejected", tone: "neutral" },
  processing: { label: "Sent, waiting for the provider", tone: "day" },
  succeeded: { label: "Refunded", tone: "night" },
  failed: { label: "Failed", tone: "danger" },
};

export const PROVIDER_LABELS: Record<Order["provider"], string> = { stripe: "Stripe", paystack: "Paystack", test: "TEST payment" };

/** Each refund on an order, one line each. */
export function RefundLines({ order }: { order: Order }) {
  if (!order.refunds.length) return null;
  return (
    <ul className="mt-1 flex flex-col gap-1">
      {order.refunds.map((r) => (
        <li key={r.id} className="text-xs text-muted">
          <span className="font-medium text-fg">{formatMoney(r.amountMinor, r.currency)}</span> · <Badge tone={REFUND_STATUS[r.status].tone}>{REFUND_STATUS[r.status].label}</Badge> · {r.reason}
          {r.endsPass ? " · ends the pass" : ""} · by {r.requestedBy}
          {r.decidedBy ? `, ${r.status === "rejected" ? "rejected" : "approved"} by ${r.decidedBy}` : ""}
          {r.failureReason ? ` · ${r.failureReason}` : ""}
          {` · ${formatLagosDateTime(r.createdAt)}`}
        </li>
      ))}
    </ul>
  );
}

export function RefundPanel({ order, approvalOver, onDone }: { order: Order; approvalOver: number; onDone: () => void }) {
  return (
    <SidePanel
      title="Refund"
      description={`${order.member.fullName}, ${order.plan.name}: paid ${formatMoney(order.amountMinor, order.currency)}, up to ${formatMoney(order.refundable, order.currency)} left to refund.`}
      trigger={(open) => (
        <Button size="sm" tone="ghost" onClick={open}>
          Refund
        </Button>
      )}
    >
      {(close) => (
        <ActionForm
          action={async (form) => {
            const amountMinor = parseMajorToMinor(text(form, "amount"));
            if (!amountMinor) throw new Error("Amount: enter how much to refund, e.g. 25,000");
            await api(`/admin/orders/${order.id}/refunds`, { method: "POST", body: { amountMinor, reason: text(form, "reason"), endsPass: checked(form, "endsPass") } });
            close();
            onDone();
          }}
        >
          {(busy) => (
            <>
              <Field label={`Amount (${order.currency})`} hint={`Over ${formatMoney(approvalOver, order.currency)} needs a second person to approve before it's sent.`}>
                <Input name="amount" inputMode="decimal" required defaultValue={minorToMajorInput(order.refundable)} />
              </Field>
              <Field label="Reason" hint="Kept in the audit log.">
                <Textarea name="reason" required minLength={3} />
              </Field>
              <Checkbox name="endsPass" defaultChecked={order.refundable === order.amountMinor} label="End the pass" hint="Cancels the pass (and the whole crew's, for a Crew pass) and stops auto-renew once the refund goes through." />
              <Button type="submit" disabled={busy}>
                Refund
              </Button>
            </>
          )}
        </ActionForm>
      )}
    </SidePanel>
  );
}
