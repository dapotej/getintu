// Booking requests and their status: the concierge confirms each one with the venue.
import { RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Badge, Card, Loading, T, styles as ui } from "@/components/ui";
import { useCached } from "@/lib/data";
import { BOOKING_STATUS, formatDate, tripText } from "@/lib/logic";
import { colors, space } from "@/lib/theme";
import type { Booking } from "@/lib/types";

export default function Bookings() {
  const { data, loading, reload, offline } = useCached<{ bookings: Booking[] }>("bookings", "/bookings");
  return (
    <SafeAreaView style={ui.screen} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={[ui.padded, { gap: space(4), paddingBottom: space(10) }]} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} tintColor={colors.cream} />}>
        <T variant="title" accessibilityRole="header">
          Bookings
        </T>
        {offline ? <Badge label="Offline: showing what was saved" tone="day" /> : null}
        {!data ? <Loading /> : null}
        {data?.bookings.length === 0 ? <T color={colors.muted}>No bookings yet. Find a venue in Discover and request one: the concierge confirms it with the venue.</T> : null}
        {data?.bookings.map((b) => {
          const status = BOOKING_STATUS[b.status];
          return (
            <Card key={b.id}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space(3) }}>
                <T variant="heading" style={{ flex: 1 }}>
                  {b.venue?.name ?? "Booking"}
                </T>
                <Badge label={status.label} tone={status.tone} />
              </View>
              <T variant="small" color={colors.muted}>
                {formatDate(b.bookingDate, { weekday: true })}
                {b.offerName ? ` · ${b.offerName}` : ""}
                {b.partySize > 1 ? ` · ${b.partySize} people` : ""}
              </T>
              {b.trip ? (
                <T variant="small" color={colors.cream}>
                  {tripText(b.trip)}
                </T>
              ) : null}
              {b.notes ? (
                <T variant="small" color={colors.faint}>
                  {b.notes}
                </T>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}
