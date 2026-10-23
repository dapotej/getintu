// Where to go: one row per part of the catalogue (Beach & Water, Nightlife & Social…), each a
// sideways-scrolling set of venue cards. Search, day or night, and what the plan includes narrow
// it down; the map shows the same venues.
import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useMemo, useState, type ComponentProps } from "react";
import { Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { VenueMap } from "@/components/venue-map";
import { Badge, Chip, Loading, T, styles as ui } from "@/components/ui";
import { useCached } from "@/lib/data";
import { discoverSections } from "@/lib/logic";
import { colors, fonts, space } from "@/lib/theme";
import type { Venue } from "@/lib/types";

type IconName = ComponentProps<typeof Ionicons>["name"];
/** An icon for each part of the catalogue. */
const SECTION_ICONS: Record<string, IconName> = {
  C01: "airplane",
  C02: "restaurant",
  C03: "sunny",
  C04: "barbell",
  C05: "cut",
  C06: "moon",
  C07: "color-palette",
  C08: "sparkles",
};
const iconFor = (code: string): IconName => SECTION_ICONS[code] ?? "location";

const CARD_WIDTH = 236;

export default function Discover() {
  const { data, loading, reload, offline } = useCached<{ venues: Venue[] }>("venues", "/venues");
  const [side, setSide] = useState<"all" | "day" | "night">("all");
  const [includedOnly, setIncludedOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [map, setMap] = useState(false);
  const rows = useMemo(() => discoverSections(data?.venues ?? [], { side, includedOnly, search }), [data, side, includedOnly, search]);
  const shown = rows.flatMap((r) => r.venues);

  return (
    <SafeAreaView style={ui.screen} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={{ gap: space(5), paddingBottom: space(10), paddingTop: space(4) }} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} tintColor={colors.cream} />} keyboardShouldPersistTaps="handled">
        <View style={{ paddingHorizontal: space(5), gap: space(3) }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <T variant="title" accessibilityRole="header">
              Discover
            </T>
            <Pressable accessibilityRole="button" accessibilityLabel={map ? "Show list" : "Show map"} onPress={() => setMap((m) => !m)} style={{ flexDirection: "row", alignItems: "center", gap: space(1.5), paddingHorizontal: space(3), paddingVertical: space(2), borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
              <Ionicons name={map ? "list" : "map"} size={16} color={colors.cream} />
              <T variant="small" style={{ fontFamily: fonts.semibold }}>
                {map ? "List" : "Map"}
              </T>
            </Pressable>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space(2), backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.line, paddingHorizontal: space(3) }}>
            <Ionicons name="search" size={18} color={colors.faint} />
            <TextInput
              accessibilityLabel="Search venues"
              value={search}
              onChangeText={setSearch}
              placeholder="Search venues, areas or kinds of place"
              placeholderTextColor={colors.faint}
              style={{ flex: 1, minHeight: 46, color: colors.cream, fontFamily: fonts.medium, fontSize: 16 }}
              returnKeyType="search"
            />
          </View>
          <View accessibilityRole="radiogroup" accessibilityLabel="Day or night" style={{ flexDirection: "row", gap: space(2), flexWrap: "wrap", alignItems: "center" }}>
            {(["all", "day", "night"] as const).map((s) => (
              <Pressable key={s} accessibilityRole="radio" accessibilityLabel={s === "all" ? "All" : s === "day" ? "Day" : "Night"} accessibilityState={{ checked: side === s }} onPress={() => setSide(s)} style={{ flexDirection: "row", alignItems: "center", gap: space(1.5), paddingHorizontal: space(3.5), paddingVertical: space(2), borderRadius: 999, borderWidth: 1, borderColor: side === s ? colors.cream : colors.line, backgroundColor: side === s ? colors.cream : colors.surface }}>
                {s !== "all" ? <Ionicons name={s === "day" ? "sunny" : "moon"} size={14} color={side === s ? colors.ink : s === "day" ? colors.day : colors.night} /> : null}
                <T variant="small" color={side === s ? colors.ink : colors.cream} style={{ fontFamily: fonts.semibold }}>
                  {s === "all" ? "All" : s === "day" ? "Day" : "Night"}
                </T>
              </Pressable>
            ))}
            <View style={{ width: 1, height: 24, backgroundColor: colors.line, marginHorizontal: space(1) }} />
            <Chip label="In my plan" on={includedOnly} onPress={() => setIncludedOnly((v) => !v)} />
          </View>
          {offline ? <Badge label="Offline: showing what was saved" tone="day" /> : null}
        </View>

        {!data ? <Loading /> : null}
        {map ? (
          <View style={{ paddingHorizontal: space(5) }}>
            <VenueMap venues={shown} />
          </View>
        ) : (
          rows.map(({ section, venues }) => (
            <View key={section.code} accessibilityRole="list" accessibilityLabel={section.name} style={{ gap: space(3) }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space(2.5), paddingHorizontal: space(5) }}>
                <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: section.code === "C06" ? "rgba(46,230,214,0.15)" : "rgba(255,176,32,0.15)" }}>
                  <Ionicons name={iconFor(section.code)} size={18} color={section.code === "C06" ? colors.night : colors.day} />
                </View>
                <T variant="heading" accessibilityRole="header" style={{ flex: 1 }}>
                  {section.name}
                </T>
                <T variant="small" color={colors.faint}>
                  {venues.length}
                </T>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(3), paddingHorizontal: space(5) }} decelerationRate="fast" snapToInterval={CARD_WIDTH + space(3)}>
                {venues.map((v) => (
                  <VenueCard key={v.id} v={v} />
                ))}
              </ScrollView>
            </View>
          ))
        )}
        {data && rows.length === 0 ? (
          <View style={{ paddingHorizontal: space(5) }}>
            <T color={colors.muted}>Nothing matches. Clear the search, choose All, or turn off In my plan.</T>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function VenueCard({ v }: { v: Venue }) {
  const accent = v.night ? colors.night : colors.day;
  return (
    <Link href={`/venues/${v.id}`} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={v.name} style={{ width: CARD_WIDTH, borderRadius: 18, overflow: "hidden", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line }}>
        <View style={{ height: 76, backgroundColor: v.night ? "rgba(46,230,214,0.12)" : "rgba(255,176,32,0.12)", alignItems: "flex-start", justifyContent: "space-between", padding: space(3) }}>
          <Ionicons name={iconFor(v.section.code)} size={26} color={accent} />
          <T variant="small" color={accent} style={{ fontFamily: fonts.semibold }}>
            {v.category.name}
          </T>
        </View>
        <View style={{ padding: space(3), gap: space(1.5), flex: 1 }}>
          <T variant="body" numberOfLines={2} style={{ fontFamily: fonts.bold }}>
            {v.name}
          </T>
          <T variant="small" color={colors.muted} numberOfLines={1}>
            {v.kind === "visiting" ? "Comes to you, by booking" : v.area}
          </T>
          <View style={{ flexDirection: "row", gap: space(1.5), flexWrap: "wrap", marginTop: "auto" }}>
            {v.included ? <Badge label="In your plan" tone={v.night ? "night" : "day"} /> : null}
            {v.kind === "place" ? <Badge label={v.openNow ? "Open now" : "Closed"} tone={v.openNow ? "night" : "muted"} /> : null}
          </View>
        </View>
      </Pressable>
    </Link>
  );
}
