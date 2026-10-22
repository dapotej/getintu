// The member's details, photo, help, and signing out.
import { useRouter } from "expo-router";
import { Image, Linking, View } from "react-native";
import { Badge, Button, Card, Screen, T } from "@/components/ui";
import { whatsappLink } from "@/lib/logic";
import { useSession } from "@/lib/session";
import { colors, space } from "@/lib/theme";

export default function Account() {
  const { me, signOut } = useSession();
  const router = useRouter();
  const m = me?.member;
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

      <T variant="heading" style={{ marginTop: space(4) }}>
        Help
      </T>
      {me?.concierge ? <Button label="Message the concierge" tone="secondary" onPress={() => Linking.openURL(whatsappLink(me.concierge?.whatsapp ?? "", { fullName: m?.fullName ?? "", passNumber: null }))} /> : <T color={colors.muted}>The concierge chat isn&apos;t set up yet.</T>}
      {me?.doctorOnCall ? <Button label="Doctor on call" tone="secondary" onPress={() => Linking.openURL(`tel:${me.doctorOnCall?.phone ?? ""}`)} /> : null}

      <Button label="Sign out" tone="ghost" onPress={() => void signOut()} style={{ marginTop: space(6) }} />
    </Screen>
  );
}
