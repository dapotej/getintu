// The first screen for someone signed out: join intu, or sign in as a member.
import { useRouter } from "expo-router";
import { View } from "react-native";
import { Button, Screen, T, Wordmark } from "@/components/ui";
import { config } from "@/lib/config";
import { colors, space } from "@/lib/theme";

export default function Welcome() {
  const router = useRouter();
  return (
    <Screen>
      <View style={{ paddingTop: space(10), gap: space(2) }}>
        <Wordmark size={40} />
        <T variant="title" accessibilityRole="header">Your Lagos, day and night.</T>
        <T color={colors.muted}>Beach clubs, golf, gyms, spas and nightlife, plus airport and travel perks, on one pass.</T>
      </View>
      <View style={{ gap: space(3), marginTop: space(6) }}>
        <Button label="Join intu" tone="day" onPress={() => router.replace("/sign-in?mode=join")} />
        <Button label="I'm already a member" tone="secondary" onPress={() => router.replace("/sign-in?mode=member")} />
      </View>
      <T variant="small" color={colors.muted} style={{ textAlign: "center", marginTop: space(6) }}>Version {config.version}</T>
    </Screen>
  );
}
