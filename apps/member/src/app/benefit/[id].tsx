// One benefit: what's left, what it covers, the rules, how to use it (by how the catalogue says
// it's used), where it works, and the visits that used it. Everything is decided by the API.
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Linking, Pressable, View } from "react-native";
import { Badge, Button, Card, Loading, Screen, T } from "@/components/ui";
import { useCached } from "@/lib/data";
import { allowanceLabel, formatLagosTime, HOW_TO_USE, periodLabel, ruleLines, whatsappLink } from "@/lib/logic";
import { useSession } from "@/lib/session";
import { colors, fonts, space } from "@/lib/theme";
import type { BenefitPage } from "@/lib/types";

export default function Benefit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { me } = useSession();
  const { data, error } = useCached<BenefitPage>(`benefit.${id}`, `/me/allowances/${id}`);
  if (!data) return <Screen>{error ? <T color={colors.pop}>{error}</T> : <Loading />}</Screen>;
  const { benefit: b, covers, rules, venues, visits } = data;
  const accent = b.night ? colors.night : colors.day;
  const lines = ruleLines(rules);
  const mode = b.usageMode;

  return (
    <Screen>
      <View style={{ gap: space(1) }}>
        <T variant="label" color={accent}>
          {data.membership.plan.name}
        </T>
        <T variant="title" accessibilityRole="header">
          {b.name}
        </T>
      </View>

      {mode === "call" ? null : (
        <Card accent={accent}>
          <T variant="huge" color={b.remaining === 0 ? colors.pop : accent}>
            {allowanceLabel(b)}
          </T>
          <T variant="small" color={colors.muted}>
            {periodLabel(b)}
            {b.sharedByCrew ? " · shared by your Crew" : ""}
          </T>
        </Card>
      )}

      <View style={{ gap: space(2) }}>
        <T variant="heading">How to use it</T>
        <T color={colors.muted}>{HOW_TO_USE[mode]}</T>
        {mode === "door" ? <Button label="Show my pass" onPress={() => router.navigate("/")} /> : null}
        {mode === "call"
          ? venues
              .filter((v) => v.servicePhone)
              .map((v) => <Button key={v.id} label={venues.length > 1 ? `Call ${v.name}` : "Call now"} tone={b.night ? "night" : "day"} onPress={() => Linking.openURL(`tel:${v.servicePhone ?? ""}`)} />)
          : null}
        {mode === "concierge" && me?.concierge ? <Button label="Message the concierge" onPress={() => Linking.openURL(`${whatsappLink(me.concierge?.whatsapp ?? "", { fullName: me.member?.fullName ?? "", passNumber: null })}${encodeURIComponent(`I'd like to use my ${b.name} benefit.`)}`)} /> : null}
        {(mode === "booking" || mode === "airport") && venues.length === 1 ? <Button label={mode === "airport" ? "Request it" : "Request a booking"} onPress={() => router.push(`/book/${venues[0]?.id ?? ""}`)} /> : null}
        {mode === "call" && venues.length === 0 ? <T color={colors.faint}>The line isn&apos;t set up yet. Message the concierge.</T> : null}
      </View>

      {covers.length > 1 || (covers.length === 1 && covers[0] !== b.name) ? (
        <View style={{ gap: space(2) }}>
          <T variant="heading">What it covers</T>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space(2) }}>
            {covers.map((c) => (
              <Badge key={c} label={c} tone={b.night ? "night" : "day"} />
            ))}
          </View>
        </View>
      ) : null}

      {lines.length ? (
        <View style={{ gap: space(1.5) }}>
          <T variant="heading">Good to know</T>
          {lines.map((l) => (
            <View key={l} style={{ flexDirection: "row", gap: space(2), alignItems: "center" }}>
              <Ionicons name="checkmark-circle" size={18} color={accent} />
              <T color={colors.muted}>{l}</T>
            </View>
          ))}
        </View>
      ) : null}

      {mode !== "call" && mode !== "concierge" && mode !== "in_app" ? (
        <View style={{ gap: space(2) }}>
          <T variant="heading">Where</T>
          {venues.length === 0 ? <T color={colors.muted}>No venue offers this yet.</T> : null}
          {venues.map((v) => (
            <Pressable
              key={v.id}
              accessibilityRole="link"
              accessibilityLabel={v.name}
              onPress={() => router.push(mode === "booking" || mode === "airport" ? `/book/${v.id}` : `/venues/${v.id}`)}
              style={{ flexDirection: "row", alignItems: "center", gap: space(3), padding: space(3.5), borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <T style={{ fontFamily: fonts.semibold }}>{v.name}</T>
                <T variant="small" color={colors.muted}>
                  {v.kind === "visiting" ? "Comes to you" : v.area}
                  {v.services.length ? ` · ${v.services.join(", ")}` : ""}
                </T>
              </View>
              {v.kind === "place" ? <Badge label={v.openNow ? "Open" : "Closed"} tone={v.openNow ? "night" : "muted"} /> : null}
              <Ionicons name="chevron-forward" size={18} color={colors.faint} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {mode !== "call" ? (
        <View style={{ gap: space(1) }}>
          <T variant="heading">Your visits</T>
          {visits.length === 0 ? <T color={colors.muted}>Not used yet.</T> : null}
          {visits.map((v) => (
            <View key={v.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: space(3), paddingVertical: space(2.5), borderBottomWidth: 1, borderBottomColor: colors.line }}>
              <View style={{ flex: 1 }}>
                <T>{v.venue.name}</T>
                <T variant="small" color={colors.muted}>
                  {v.service}
                  {v.partySize > 1 ? ` · party of ${v.partySize}` : ""}
                </T>
              </View>
              <T variant="small" color={colors.muted}>
                {formatLagosTime(v.occurredAt)}
              </T>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}
