import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { colors, fonts } from "@/lib/theme";

const icon = (name: ComponentProps<typeof Ionicons>["name"]) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={String(color)} size={size} />;
  };

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.ink, borderTopColor: colors.line },
        tabBarActiveTintColor: colors.day,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Pass", tabBarIcon: icon("qr-code") }} />
      <Tabs.Screen name="benefits" options={{ title: "Benefits", tabBarIcon: icon("sparkles") }} />
      <Tabs.Screen name="discover" options={{ title: "Discover", tabBarIcon: icon("compass") }} />
      <Tabs.Screen name="bookings" options={{ title: "Bookings", tabBarIcon: icon("calendar") }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarIcon: icon("person-circle") }} />
    </Tabs>
  );
}
