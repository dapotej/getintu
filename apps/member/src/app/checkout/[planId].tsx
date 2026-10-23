// Paying for a pass: the member confirms their email for the receipt, pays on Stripe's or
// Paystack's own page, and comes back here while the payment is confirmed. The pass is only made
// once the provider tells the API it's paid.
import { useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Button, Card, Field, Loading, Notice, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useCached } from "@/lib/data";
import { formatDate, formatMoney } from "@/lib/logic";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";
import type { Currency, PlanOffer, Receipt } from "@/lib/types";

/** How long to keep checking for the provider's confirmation after the payment page closes. */
const CONFIRM_FOR_MS = 3 * 60_000;
const CHECK_EVERY_MS = 2_000;

export default function Checkout() {
  const { planId, currency } = useLocalSearchParams<{ planId: string; currency: Currency }>();
  const router = useRouter();
  const { me, refreshMe } = useSession();
  const plans = useCached<{ plans: PlanOffer[]; currency: Currency }>("plans", null);
  const plan = plans.data?.plans.find((p) => p.id === planId);
  const price = plan?.prices.find((p) => p.currency === currency);
  const [email, setEmail] = useState(me?.member?.email ?? "");
  const [stage, setStage] = useState<"ready" | "paying" | "confirming" | "paid" | "not_paid">("ready");
  const [error, setError] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const stopped = useRef(false);
  useEffect(() => () => void (stopped.current = true), []);

  if (!plan || !price) return <Screen>{plans.data ? <Notice>This pass isn&apos;t on sale any more.</Notice> : <Loading />}</Screen>;

  const watch = async (id: string) => {
    setStage("confirming");
    const until = Date.now() + CONFIRM_FOR_MS;
    while (!stopped.current && Date.now() < until) {
      try {
        const { order } = await api<{ order: Receipt }>(`/me/orders/${id}`);
        if (order.status === "paid") {
          await refreshMe();
          return setStage("paid");
        }
        if (order.status === "failed" || order.status === "expired") return setStage("not_paid");
      } catch {
        // No signal for a moment: keep checking.
      }
      await new Promise((r) => setTimeout(r, CHECK_EVERY_MS));
    }
    if (!stopped.current) setStage("not_paid");
  };

  const pay = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Add your email for the receipt");
    setError(null);
    setStage("paying");
    try {
      const start = await api<{ orderId: string; url: string }>("/checkout", { body: { planId: plan.id, currency: price.currency, email: email.trim() } });
      setOrderId(start.orderId);
      await WebBrowser.openBrowserAsync(start.url);
      await watch(start.orderId);
    } catch (err) {
      setError(errorText(err));
      setStage("ready");
    }
  };

  if (stage === "paid")
    return (
      <Screen>
        <T variant="title" accessibilityRole="header">
          You&apos;re in
        </T>
        <Card accent={colors.night}>
          <T variant="heading">{plan.name}</T>
          <T color={colors.muted}>{plan.renews ? `From today, renewing each year.` : `${formatDate(plan.startsOn)} – ${formatDate(plan.endsOn)}`}</T>
          <T color={colors.muted}>Your receipt is in Account → Payments.</T>
        </Card>
        {plan.crewSize > 1 ? <T>Invite the rest of your crew from the Account tab.</T> : null}
        <Button label="Show my pass" onPress={() => router.dismissTo("/")} />
      </Screen>
    );

  return (
    <Screen>
      <T variant="title" accessibilityRole="header">
        {plan.name}
      </T>
      <Card accent={colors.day}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <T>{plan.renews ? "Each year" : "Total"}</T>
          <T variant="heading" color={colors.day}>
            {formatMoney(price.amountMinor, price.currency)}
          </T>
        </View>
        <T variant="small" color={colors.muted}>
          {plan.renews ? `Starts today and renews on the same date each year until you turn it off in Account.` : `Valid ${formatDate(plan.startsOn)} – ${formatDate(plan.endsOn)}.`}
        </T>
      </Card>
      {error ? <Notice>{error}</Notice> : null}
      {stage === "confirming" ? (
        <Card>
          <Loading />
          <T color={colors.muted}>Confirming your payment. This takes a few seconds once you&apos;ve paid.</T>
          {orderId ? <Button label="Check again" tone="secondary" onPress={() => void watch(orderId)} /> : null}
        </Card>
      ) : stage === "not_paid" ? (
        <>
          <Notice tone="day">The payment didn&apos;t go through, or wasn&apos;t finished. Nothing was taken.</Notice>
          <Button label="Try again" onPress={() => setStage("ready")} />
        </>
      ) : (
        <>
          <Field label="Email for your receipt" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          <Button label={`Pay ${formatMoney(price.amountMinor, price.currency)}`} tone="day" busy={stage === "paying"} onPress={() => void pay()} />
          <T variant="small" color={colors.muted}>
            {price.currency === "NGN" ? "You pay on Paystack's secure page: card, bank transfer or USSD." : "You pay by card on Stripe's secure page."} intu never sees your card details.
          </T>
        </>
      )}
    </Screen>
  );
}
