import type { ExpoConfig } from "expo/config";

// The member app. API and Supabase addresses come from EXPO_PUBLIC_* variables at build time
// (see .env.example); the Expo project id is set once the app is linked to intu's Expo account.
const config: ExpoConfig = {
  name: "intu",
  slug: "intu",
  scheme: "intu",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "dark",
  backgroundColor: "#0D0B1A",
  icon: "./assets/icon.png",
  ios: {
    bundleIdentifier: "com.getintu.member",
    supportsTablet: false,
    infoPlist: {
      NSCameraUsageDescription: "intu uses the camera for your member photo, which venues check at the door.",
      NSPhotoLibraryUsageDescription: "Choose a photo of yourself for your intu pass.",
    },
  },
  android: {
    package: "com.getintu.member",
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#0D0B1A" },
    permissions: ["CAMERA"],
  },
  web: { bundler: "metro", output: "single", favicon: "./assets/favicon.png" },
  plugins: [
    "expo-router",
    ["expo-splash-screen", { image: "./assets/splash.png", imageWidth: 220, backgroundColor: "#0D0B1A" }],
    "expo-secure-store",
    ["expo-image-picker", { cameraPermission: "intu uses the camera for your member photo, which venues check at the door." }],
  ],
  experiments: { typedRoutes: false },
  extra: process.env.EXPO_PROJECT_ID ? { eas: { projectId: process.env.EXPO_PROJECT_ID } } : {},
  ...(process.env.EXPO_OWNER ? { owner: process.env.EXPO_OWNER } : {}),
  updates: process.env.EXPO_PROJECT_ID ? { url: `https://u.expo.dev/${process.env.EXPO_PROJECT_ID}` } : {},
  runtimeVersion: { policy: "sdkVersion" },
};

export default config;
