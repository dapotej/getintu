// The member's payments: what was paid, when, and any refund.
import { View } from "react-native";
import { Badge, Card, Loading, Notice, Screen, T } from "@/components/ui";
import { useCached } from "@/lib/data";
import { formatLagosTime, formatMoney, RECEIPT_STATUS } from "@/lib/logic";
import { colors, space } from "@/lib/theme";
import type { Receipt } from "@/lib/types";

export default function Receipts() {
  const { data, error } = useCached<{ orders: Receipt[] }>("orders", "/me/orders");
  if (!data) return <Screen>{error ? <Notice>{error}</Notice> : <Loading />}</Screen>;
  return (
    <Screen>
      <T variant="title" accessibilityRole="header">
        Payments
      </T>
      {data.orders.length === 0 ? <Notice tone="muted">No payments yet.</Notice> : null}
      {data.orders.map((o) => {
        const status = RECEIPT_STATUS[o.status] ?? { label: o.status, tone: "muted" as const };
        return (
          <Card key={o.id}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space(3) }}>
              <T variant="heading" style={{ flex: 1 }}>
                {o.plan.name}
              </T>
              <T variant="heading">{formatMoney(o.amountMinor, o.currency)}</T>
            </View>
            <View style={{ flexDirection: "row", gap: space(2), alignItems: "center", flexWrap: "wrap" }}>
              <Badge label={status.label} tone={status.tone} />
              <T variant="small" color={colors.muted}>
                {[o.kind === "renewal" ? "Renewal" : null, formatLagosTime(o.paidAt ?? o.createdAt)].filter(Boolean).join(" · ")}
              </T>
            </View>
            {o.refundedMinor > 0 ? (
              <T variant="small" color={colors.muted}>
                {formatMoney(o.refundedMinor, o.currency)} refunded
              </T>
            ) : null}
            <T variant="small" color={colors.faint}>
              Reference {o.id.slice(0, 8).toUpperCase()}
            </T>
          </Card>
        );
      })}
    </Screen>
  );
}
