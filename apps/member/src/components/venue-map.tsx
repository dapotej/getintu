// The venue map: Apple Maps on iPhone, Google Maps on Android, centred on Lagos. Day venues are
// amber pins, night venues teal.
import { useRouter } from "expo-router";
import MapView, { Marker } from "react-native-maps";
import { colors } from "@/lib/theme";
import type { Venue } from "@/lib/types";

const LAGOS = { latitude: 6.45, longitude: 3.43, latitudeDelta: 0.16, longitudeDelta: 0.16 };

export function VenueMap({ venues }: { venues: Venue[] }) {
  const router = useRouter();
  return (
    <MapView style={{ flex: 1, minHeight: 420, borderRadius: 18 }} initialRegion={LAGOS} userInterfaceStyle="dark">
      {venues
        .filter((v) => v.latitude !== null && v.longitude !== null)
        .map((v) => (
          <Marker
            key={v.id}
            coordinate={{ latitude: v.latitude ?? 0, longitude: v.longitude ?? 0 }}
            title={v.name}
            description={`${v.category.name} · ${v.area}`}
            pinColor={v.night ? colors.night : colors.day}
            onCalloutPress={() => router.push(`/venues/${v.id}`)}
          />
        ))}
    </MapView>
  );
}
