// What's left on each pass, benefit by benefit, and the visits that used it.
import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge, Card, Loading, T, styles as ui } from "@/components/ui";
import { useCached } from "@/lib/data";
import { allowanceLabel, formatLagosTime, periodLabel } from "@/lib/logic";
import { colors, space } from "@/lib/theme";
import type { Allowance, Membership, Visit } from "@/lib/types";

export default function Benefits() {
  const ms = useCached<{ memberships: Membership[] }>("memberships", "/me/memberships");
  const visits = useCached<{ visits: Visit[] }>("visits", "/me/visits");
  const refreshing = ms.loading || visits.loading;

  return (
    <SafeAreaView style={ui.screen} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={[ui.padded, { gap: space(4), paddingBottom: space(10) }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void Promise.all([ms.reload(), visits.reload()])} tintColor={colors.cream} />}>
        <T variant="title" accessibilityRole="header">
          Your benefits
        </T>
        {ms.offline ? <Badge label="Offline: showing what was saved" tone="day" /> : null}
        {!ms.data ? <Loading /> : null}
        {ms.data?.memberships.length === 0 ? <T color={colors.muted}>No pass yet.</T> : null}
        {ms.data?.memberships.map((m) => (
          <View key={m.id} style={{ gap: space(3) }}>
            <T variant="label" color={colors.muted}>
              {m.plan.name}
            </T>
            {m.allowances.length === 0 ? <T color={colors.muted}>This plan has no benefits to count.</T> : m.allowances.map((a) => <AllowanceCard key={a.id} a={a} />)}
          </View>
        ))}

        <T variant="heading" style={{ marginTop: space(4) }}>
          Your visits
        </T>
        {visits.data?.visits.length === 0 ? <T color={colors.muted}>No visits yet. Show your pass at any intu venue.</T> : null}
        {visits.data?.visits.map((v) => (
          <View key={v.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: space(3), paddingVertical: space(2), borderBottomWidth: 1, borderBottomColor: colors.line }}>
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
      </ScrollView>
    </SafeAreaView>
  );
}

function AllowanceCard({ a }: { a: Allowance }) {
  const accent = a.night ? colors.night : colors.day;
  const share = a.granted ? Math.min(1, a.used / a.granted) : 0;
  return (
    <Card accent={accent}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space(3) }}>
        <T variant="heading" style={{ flex: 1 }}>
          {a.name}
        </T>
        <T variant="heading" color={a.remaining === 0 ? colors.pop : accent}>
          {allowanceLabel(a)}
        </T>
      </View>
      {a.granted ? (
        <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.raised, overflow: "hidden" }}>
          <View style={{ width: `${(1 - share) * 100}%`, height: 6, backgroundColor: accent }} />
        </View>
      ) : null}
      <T variant="small" color={colors.muted}>
        {periodLabel(a)}
        {a.sharedByCrew ? " · shared by your Crew" : ""}
      </T>
    </Card>
  );
}
