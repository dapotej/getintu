// One venue: what it offers, whether the member's plan includes it, hours, directions and booking.
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Linking, Platform, View } from "react-native";
import { Badge, Button, Card, Loading, Screen, T } from "@/components/ui";
import { useCached } from "@/lib/data";
import { hoursToday } from "@/lib/logic";
import { colors, space } from "@/lib/theme";
import type { Venue } from "@/lib/types";

const directions = (v: Venue) => {
  const ll = `${v.latitude},${v.longitude}`;
  const label = encodeURIComponent(v.name);
  return Platform.OS === "ios" ? `https://maps.apple.com/?ll=${ll}&q=${label}` : Platform.OS === "android" ? `geo:${ll}?q=${ll}(${label})` : `https://www.google.com/maps/search/?api=1&query=${ll}`;
};

export default function VenuePage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const list = useCached<{ venues: Venue[] }>("venues", null);
  const one = useCached<{ venue: Venue }>(`venue.${id}`, `/venues/${id}`);
  const v = one.data?.venue ?? list.data?.venues.find((x) => x.id === id);
  if (!v) return <Screen>{one.error ? <T color={colors.pop}>{one.error}</T> : <Loading />}</Screen>;
  const accent = v.night ? colors.night : colors.day;

  return (
    <Screen>
      <Stack.Screen options={{ title: "" }} />
      <View style={{ gap: space(1) }}>
        <T variant="label" color={accent}>
          {v.category.name}
        </T>
        <T variant="title" accessibilityRole="header">
          {v.name}
        </T>
        <T color={colors.muted}>{v.kind === "visiting" ? "Comes to you, by booking" : v.kind === "remote" ? "By phone, any time" : `${v.area}, ${v.city === "lagos" ? "Lagos" : "Abuja"}`}</T>
      </View>
      <View style={{ flexDirection: "row", gap: space(2), flexWrap: "wrap" }}>
        <Badge label={v.included ? "In your plan" : "Not in your plan"} tone={v.included ? (v.night ? "night" : "day") : "muted"} />
        {v.kind === "place" ? <Badge label={v.openNow ? "Open now" : "Closed now"} tone={v.openNow ? "night" : "muted"} /> : null}
      </View>
      {v.description ? <T color={colors.muted}>{v.description}</T> : null}
      {v.kind === "place" ? (
        <T variant="small" color={colors.muted}>
          Today: {hoursToday(v.openingHours, new Date())} (Lagos time)
        </T>
      ) : null}

      <T variant="heading">What you get</T>
      {v.offers.map((o) => (
        <Card key={o.id} accent={o.included ? accent : colors.line}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space(3) }}>
            <T style={{ flex: 1 }}>{o.name}</T>
            <Badge label={o.included ? "Included" : "Not included"} tone={o.included ? (v.night ? "night" : "day") : "muted"} />
          </View>
          {o.description ? (
            <T variant="small" color={colors.muted}>
              {o.description}
            </T>
          ) : null}
        </Card>
      ))}

      {v.kind === "remote" ? (
        v.servicePhone && v.included ? <Button label="Call now" onPress={() => Linking.openURL(`tel:${v.servicePhone ?? ""}`)} /> : <T color={colors.muted}>A service by phone, for members whose plan includes it.</T>
      ) : (
        <Button label={v.offers.length > 0 && v.offers.every((o) => o.usageMode === "airport") ? "Request it with your flight" : "Request a booking"} onPress={() => router.push(`/book/${v.id}`)} />
      )}
      {v.latitude !== null && v.longitude !== null ? <Button label="Directions" tone="secondary" onPress={() => Linking.openURL(directions(v))} /> : null}
    </Screen>
  );
}
