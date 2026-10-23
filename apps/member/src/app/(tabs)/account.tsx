// The member's details, photo, passes and auto-renewal, payments, help, and signing out.
import { useRouter } from "expo-router";
import { useState } from "react";
import { Image, Linking, View } from "react-native";
import { Badge, Button, Card, Notice, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useCached } from "@/lib/data";
import { formatDate, formatMoney, whatsappLink } from "@/lib/logic";
import { EmailSignIn } from "@/components/email-sign-in";
import { useSession } from "@/lib/session";
import { config } from "@/lib/config";
import { colors, space } from "@/lib/theme";
import type { Membership, Subscription } from "@/lib/types";

/** Auto-renew for a yearly pass: on, off (runs to its end), or a card that needs updating. */
function Renewal({ sub, endsOn, onChange }: { sub: Subscription; endsOn: string | null; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toggle = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/me/subscriptions/${sub.id}/auto-renew`, { body: { on: !sub.autoRenew } });
      onChange();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card accent={sub.status === "past_due" ? colors.pop : colors.day}>
      <T variant="heading">{sub.plan.name}</T>
      <T variant="small" color={colors.muted}>
        {sub.status === "cancelled"
          ? `Doesn't renew${endsOn ? `: ends ${formatDate(endsOn)}` : ""}.`
          : sub.autoRenew
            ? `Renews${endsOn ? ` on ${formatDate(endsOn)}` : " each year"} for ${formatMoney(sub.amountMinor, sub.currency)}.`
            : `Auto-renew is off${endsOn ? `: the pass ends ${formatDate(endsOn)}` : ""}.`}
      </T>
      {sub.status === "past_due" ? <Notice>{`The renewal payment didn't go through${sub.lastFailureReason ? ` (${sub.lastFailureReason})` : ""}. Message the concierge to update your card.`}</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      {sub.status !== "cancelled" ? <Button label={sub.autoRenew ? "Turn off auto-renew" : "Turn on auto-renew"} tone="secondary" busy={busy} onPress={() => void toggle()} /> : null}
    </Card>
  );
}

export default function Account() {
  const { me, signOut } = useSession();
  const router = useRouter();
  const m = me?.member;
  const subs = useCached<{ subscriptions: Subscription[] }>("subscriptions", "/me/subscriptions");
  const passes = useCached<{ memberships: Membership[] }>("memberships", "/me/memberships");
  const endOf = (membershipId: string | null) => passes.data?.memberships.find((p) => p.id === membershipId)?.endsOn ?? null;
  const crews = (passes.data?.memberships ?? []).filter((p) => p.crew);
  return (
    <Screen>
      <T variant="title" accessibilityRole="header">
        Account
      </T>
      <Card style={{ flexDirection: "row", alignItems: "center", gap: space(4) }}>
        {m?.photoUrl ? <Image source={{ uri: m.photoUrl }} accessibilityLabel="Your photo" style={{ width: 64, height: 64, borderRadius: 32 }} /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="heading">{m?.fullName}</T>
          <T variant="small" color={colors.muted}>
            {m?.phone}
          </T>
          {m?.email ? (
            <T variant="small" color={colors.muted}>
              {m.email}
            </T>
          ) : null}
          {m?.isTest ? <Badge label="TEST account" tone="day" /> : null}
        </View>
      </Card>
      <Button label="Edit details" tone="secondary" onPress={() => router.push("/setup")} />
      <Button label="Change photo" tone="secondary" onPress={() => router.push("/photo")} />
      <EmailSignIn />

      <T variant="heading" style={{ marginTop: space(4) }}>
        Membership
      </T>
      {(subs.data?.subscriptions ?? []).map((s) => (
        <Renewal key={s.id} sub={s} endsOn={endOf(s.currentMembershipId)} onChange={() => void subs.reload()} />
      ))}
      {crews.map((p) => (
        <Button key={p.id} label={`Your crew: ${p.plan.name}`} tone="secondary" onPress={() => router.push(`/crew/${p.id}`)} />
      ))}
      <Button label="Get a pass" tone="day" onPress={() => router.push("/plans")} />
      <Button label="Payments and receipts" tone="secondary" onPress={() => router.push("/receipts")} />

      <T variant="heading" style={{ marginTop: space(4) }}>
        Help
      </T>
      {me?.concierge ? <Button label="Message the concierge" tone="secondary" onPress={() => Linking.openURL(whatsappLink(me.concierge?.whatsapp ?? "", { fullName: m?.fullName ?? "", passNumber: null }))} /> : <T color={colors.muted}>The concierge chat isn&apos;t set up yet.</T>}
      {me?.doctorOnCall ? <Button label="Doctor on call" tone="secondary" onPress={() => Linking.openURL(`tel:${me.doctorOnCall?.phone ?? ""}`)} /> : null}

      <Button label="Sign out" tone="ghost" onPress={() => void signOut()} style={{ marginTop: space(6) }} />
      <T variant="small" color={colors.muted} style={{ textAlign: "center" }}>Version {config.version}</T>
    </Screen>
  );
}
