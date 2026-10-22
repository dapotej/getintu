// Where to go: venues by day and night, what the member's plan includes, as a list or a map.
import { Link } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { VenueMap } from "@/components/venue-map";
import { Badge, Check, Loading, T, styles as ui } from "@/components/ui";
import { useCached } from "@/lib/data";
import { colors, fonts, space } from "@/lib/theme";
import type { Venue } from "@/lib/types";

type Side = "all" | "day" | "night";

function Segment<V extends string>({ value, options, onChange, label }: { value: V; options: [V, string][]; onChange: (v: V) => void; label: string }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", backgroundColor: colors.surface, borderRadius: 12, padding: 4 }}>
      {options.map(([v, text]) => (
        <Pressable key={v} accessibilityRole="radio" accessibilityState={{ checked: v === value }} onPress={() => onChange(v)} style={{ flex: 1, paddingVertical: space(2), borderRadius: 9, backgroundColor: v === value ? colors.raised : "transparent", alignItems: "center" }}>
          <T variant="small" color={v === value ? colors.cream : colors.muted} style={{ fontFamily: fonts.semibold }}>
            {text}
          </T>
        </Pressable>
      ))}
    </View>
  );
}

export default function Discover() {
  const { data, loading, reload, offline } = useCached<{ venues: Venue[] }>("venues", "/venues");
  const [side, setSide] = useState<Side>("all");
  const [includedOnly, setIncludedOnly] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const venues = useMemo(() => (data?.venues ?? []).filter((v) => (side === "all" || (side === "night") === v.night) && (!includedOnly || v.included)), [data, side, includedOnly]);

  return (
    <SafeAreaView style={ui.screen} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={[ui.padded, { gap: space(4), paddingBottom: space(10) }]} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} tintColor={colors.cream} />}>
        <T variant="title" accessibilityRole="header">
          Discover
        </T>
        {offline ? <Badge label="Offline: showing what was saved" tone="day" /> : null}
        <Segment label="Day or night" value={side} onChange={setSide} options={[["all", "All"], ["day", "Day"], ["night", "Night"]]} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space(3) }}>
          <View style={{ flex: 1 }}>
            <Check label="In my plan" checked={includedOnly} onChange={setIncludedOnly} />
          </View>
          <View style={{ width: 150 }}>
            <Segment label="View" value={view} onChange={setView} options={[["list", "List"], ["map", "Map"]]} />
          </View>
        </View>
        {!data ? <Loading /> : null}
        {view === "map" ? (
          <VenueMap venues={venues} />
        ) : (
          venues.map((v) => (
            <Link key={v.id} href={`/venues/${v.id}`} asChild>
              <Pressable accessibilityRole="link" accessibilityLabel={v.name} style={{ backgroundColor: colors.surface, borderRadius: 18, padding: space(4), gap: space(1.5), borderWidth: 1, borderColor: colors.line, borderLeftWidth: 3, borderLeftColor: v.night ? colors.night : colors.day }}>
                <T variant="heading">{v.name}</T>
                <T variant="small" color={colors.muted}>
                  {v.category.name} · {v.kind === "visiting" ? "Comes to you, by booking" : v.area}
                </T>
                <View style={{ flexDirection: "row", gap: space(2), flexWrap: "wrap" }}>
                  {v.included ? <Badge label="In your plan" tone={v.night ? "night" : "day"} /> : null}
                  {v.kind === "place" ? <Badge label={v.openNow ? "Open now" : "Closed now"} tone={v.openNow ? "night" : "muted"} /> : null}
                </View>
              </Pressable>
            </Link>
          ))
        )}
        {data && venues.length === 0 ? <T color={colors.muted}>Nothing matches. Try All, or turn off In my plan.</T> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
