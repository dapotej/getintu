// The web build (tests and previews) has no native map; the list shows the same venues.
import { View } from "react-native";
import { colors } from "@/lib/theme";
import type { Venue } from "@/lib/types";
import { T } from "./ui";

export function VenueMap({ venues }: { venues: Venue[] }) {
  const placed = venues.filter((v) => v.latitude !== null).length;
  return (
    <View style={{ padding: 24, borderRadius: 18, backgroundColor: colors.surface }}>
      <T color={colors.muted}>The map shows {placed} venues in the intu app. Use the list here.</T>
    </View>
  );
}
