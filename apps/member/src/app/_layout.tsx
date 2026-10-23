import "@/lib/polyfills";
import { PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold, useFonts } from "@expo-google-fonts/plus-jakarta-sans";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider, useSession } from "@/lib/session";
import { colors, fonts } from "@/lib/theme";

void SplashScreen.preventAutoHideAsync().catch(() => null);

/** Sends people where they belong: sign in, set up a profile, take a photo, or their pass. */
function Gate() {
  const { loading, session, me } = useSession();
  const segments = useSegments();
  const router = useRouter();
  const at = segments[0] ?? "";

  useEffect(() => {
    if (loading) return;
    void SplashScreen.hideAsync().catch(() => null);
    const want = !session ? "sign-in" : me && !me.member ? "setup" : me?.member && !me.member.hasPhoto ? "photo" : null;
    if (want && at !== want) router.replace(`/${want}`);
    // Signed in with everything set up: leave the sign-in screen. Setup and photo screens move on
    // themselves, since members also open them from Account to make changes.
    else if (!want && at === "sign-in" && me?.member) router.replace("/");
  }, [loading, session, me, at, router]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.cream,
        headerTitleStyle: { fontFamily: fonts.bold },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.ink },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="setup" options={{ title: "Your details" }} />
      <Stack.Screen name="photo" options={{ title: "Your photo" }} />
      <Stack.Screen name="venues/[id]" options={{ title: "" }} />
      <Stack.Screen name="benefit/[id]" options={{ title: "" }} />
      <Stack.Screen name="book/[venueId]" options={{ title: "Request a booking", presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ PlusJakartaSans_400Regular, PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold, PlusJakartaSans_700Bold, PlusJakartaSans_800ExtraBold });
  if (!fontsLoaded) return null;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="light" />
        <Gate />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
