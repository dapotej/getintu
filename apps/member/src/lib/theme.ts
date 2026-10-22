// intu's "Lagos after dusk" look: an ink base, amber for day benefits, teal for night, coral for
// anything urgent. The member app is always dark.
export const colors = {
  ink: "#0D0B1A",
  surface: "#17142A",
  raised: "#211D3A",
  line: "#2E2950",
  cream: "#FFF5E6",
  muted: "#B9B0C9",
  faint: "#7D7494",
  day: "#FFB020",
  night: "#2EE6D6",
  pop: "#FF6B6B",
} as const;

export const fonts = {
  regular: "PlusJakartaSans_400Regular",
  medium: "PlusJakartaSans_500Medium",
  semibold: "PlusJakartaSans_600SemiBold",
  bold: "PlusJakartaSans_700Bold",
  extrabold: "PlusJakartaSans_800ExtraBold",
} as const;

export const space = (n: number) => n * 4;
