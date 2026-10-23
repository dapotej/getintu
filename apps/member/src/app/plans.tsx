// Passes on sale today: what each includes, its dates, and its price in the member's currency.
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Badge, Button, Card, Loading, Notice, Screen, Segment, T } from "@/components/ui";
import { useCached } from "@/lib/data";
import { CURRENCY_LABELS, formatDate, formatMoney } from "@/lib/logic";
import { colors, space } from "@/lib/theme";
import type { Currency, PlanOffer } from "@/lib/types";

const PERIOD_WORDS: Record<string, string> = { per_pass: "", per_month: " a month", per_year: " a year" };

export default function Plans() {
  const router = useRouter();
  const { data, error, offline } = useCached<{ plans: PlanOffer[]; currency: Currency }>("plans", "/plans");
  const [currency, setCurrency] = useState<Currency | null>(null);
  useEffect(() => {
    if (data && !currency) setCurrency(data.currency);
  }, [data, currency]);
  if (!data) return <Screen>{error ? <Notice>{error}</Notice> : <Loading />}</Screen>;
  const offered = [...new Set(data.plans.flatMap((p) => p.prices.map((x) => x.currency)))] as Currency[];
  const shown = currency && offered.includes(currency) ? currency : (offered[0] ?? data.currency);

  return (
    <Screen>
      <T variant="title" accessibilityRole="header">
        Get a pass
      </T>
      {offline ? <Notice tone="day">You&apos;re offline. Prices may have changed; connect to buy.</Notice> : null}
      {data.plans.length === 0 ? <Notice tone="muted">Nothing is on sale right now. The next passes appear here when sales open.</Notice> : null}
      {offered.length > 1 ? <Segment label="Pay in" value={shown} options={offered.map((c) => [c, CURRENCY_LABELS[c] ?? c])} onChange={setCurrency} /> : null}
      {data.plans.map((p) => {
        const price = p.prices.find((x) => x.currency === shown);
        return (
          <Card key={p.id} accent={colors.day}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space(3), alignItems: "flex-start" }}>
              <T variant="heading" style={{ flex: 1 }}>
                {p.name}
              </T>
              {price ? <T variant="heading" color={colors.day}>{formatMoney(price.amountMinor, price.currency)}</T> : null}
            </View>
            <T variant="small" color={colors.muted}>
              {p.renews ? `A year from today, ${formatDate(p.startsOn)}. Renews each year; turn it off any time.` : `${formatDate(p.startsOn)} – ${formatDate(p.endsOn)}`}
            </T>
            {p.crewSize > 1 ? <Badge label={`Crew of ${p.crewSize}: invite the others after you pay`} tone="night" /> : null}
            {p.description ? <T color={colors.muted}>{p.description}</T> : null}
            <View style={{ gap: space(1) }}>
              {p.benefits.map((b) => (
                <T key={b.code} variant="small">
                  {`• ${b.quantity === null ? "Unlimited" : b.quantity} ${b.name}${PERIOD_WORDS[b.period] ?? ""}`}
                </T>
              ))}
            </View>
            {p.held ? <Badge label="You have this pass" tone="night" /> : price ? <Button label={`Buy for ${formatMoney(price.amountMinor, price.currency)}`} tone="day" disabled={offline} onPress={() => router.push(`/checkout/${p.id}?currency=${price.currency}`)} /> : <T variant="small" color={colors.muted}>Not sold in {CURRENCY_LABELS[shown] ?? shown}.</T>}
          </Card>
        );
      })}
    </Screen>
  );
}
