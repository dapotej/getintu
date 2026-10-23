// The app's building blocks, in the intu look. Every input has an accessible label: screen readers
// use it, and so do the end-to-end tests.
import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fonts, space } from "@/lib/theme";

export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const inner = <View style={[padded && styles.padded, { gap: space(4) }]}>{children}</View>;
  return (
    <SafeAreaView style={styles.screen} edges={["top", "left", "right"]}>
      {scroll ? (
        <ScrollView contentContainerStyle={{ paddingBottom: space(10) }} keyboardShouldPersistTaps="handled">
          {inner}
        </ScrollView>
      ) : (
        inner
      )}
    </SafeAreaView>
  );
}

type Variant = "title" | "heading" | "body" | "small" | "label" | "huge";
const variants: Record<Variant, TextStyle> = {
  huge: { fontFamily: fonts.extrabold, fontSize: 34, lineHeight: 40, letterSpacing: -0.5 },
  title: { fontFamily: fonts.extrabold, fontSize: 26, lineHeight: 32, letterSpacing: -0.3 },
  heading: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24 },
  body: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 23 },
  small: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
  label: { fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18, letterSpacing: 0.3, textTransform: "uppercase" },
};

export function T({ children, variant = "body", color = colors.cream, style, ...rest }: { children: ReactNode; variant?: Variant; color?: string; style?: StyleProp<TextStyle>; numberOfLines?: number; accessibilityRole?: "header" }) {
  return (
    <Text style={[variants[variant], { color }, style]} {...rest}>
      {children}
    </Text>
  );
}

export function Button({
  label,
  onPress,
  tone = "primary",
  busy = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  tone?: "primary" | "secondary" | "ghost" | "day" | "night";
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: colors.cream, secondary: colors.raised, ghost: "transparent", day: colors.day, night: colors.night }[tone];
  const fg = tone === "secondary" || tone === "ghost" ? colors.cream : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 }, tone === "secondary" && { borderWidth: 1, borderColor: colors.line }, style]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[variants.body, { fontFamily: fonts.bold, color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, ...input }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: space(1.5) }}>
      <T variant="small" color={colors.muted}>
        {label}
      </T>
      <TextInput accessibilityLabel={label} placeholderTextColor={colors.faint} style={styles.input} {...input} />
      {hint ? (
        <T variant="small" color={colors.faint}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export function Card({ children, style, accent }: { children: ReactNode; style?: StyleProp<ViewStyle>; accent?: string }) {
  return <View style={[styles.card, accent ? { borderLeftWidth: 3, borderLeftColor: accent } : null, style]}>{children}</View>;
}

export function Badge({ label, tone = "muted" }: { label: string; tone?: "day" | "night" | "pop" | "muted" }) {
  const color = { day: colors.day, night: colors.night, pop: colors.pop, muted: colors.muted }[tone];
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <Text style={[variants.small, { fontFamily: fonts.semibold, color, fontSize: 12, lineHeight: 16 }]}>{label}</Text>
    </View>
  );
}

export function Notice({ children, tone = "pop" }: { children: ReactNode; tone?: "pop" | "day" | "muted" }) {
  const color = { pop: colors.pop, day: colors.day, muted: colors.muted }[tone];
  return (
    <View accessibilityRole="alert" style={[styles.notice, { borderColor: color }]}>
      <T variant="small" color={color}>
        {children}
      </T>
    </View>
  );
}

export function Loading() {
  return (
    <View style={{ padding: space(10), alignItems: "center" }}>
      <ActivityIndicator color={colors.cream} />
    </View>
  );
}

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <Text accessibilityLabel="intu" style={{ fontFamily: fonts.extrabold, fontSize: size, color: colors.cream, letterSpacing: -0.5 }}>
      intu<Text style={{ color: colors.day }}>.</Text>
    </Text>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.ink },
  padded: { paddingHorizontal: space(5), paddingTop: space(4) },
  button: { minHeight: 52, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: space(5) },
  input: { minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, color: colors.cream, paddingHorizontal: space(4), fontFamily: fonts.medium, fontSize: 17 },
  card: { backgroundColor: colors.surface, borderRadius: 18, padding: space(4), gap: space(2), borderWidth: 1, borderColor: colors.line },
  badge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: space(2.5), paddingVertical: 2, alignSelf: "flex-start" },
  notice: { borderWidth: 1, borderRadius: 12, padding: space(3) },
});

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked }} onPress={() => onChange(!checked)} style={{ flexDirection: "row", gap: space(3), alignItems: "center", paddingVertical: space(1) }}>
      <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: checked ? colors.day : colors.line, backgroundColor: checked ? colors.day : "transparent", alignItems: "center", justifyContent: "center" }}>
        {checked ? <Text style={{ color: colors.ink, fontFamily: fonts.extrabold, fontSize: 14 }}>✓</Text> : null}
      </View>
      <T variant="small" style={{ flex: 1 }}>
        {label}
      </T>
    </Pressable>
  );
}

/** A row of choices where one is on, e.g. Day / Night. */
export function Segment<V extends string>({ value, options, onChange, label }: { value: V; options: [V, string][]; onChange: (v: V) => void; label: string }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", backgroundColor: colors.surface, borderRadius: 12, padding: 4 }}>
      {options.map(([v, text]) => (
        <Pressable key={v} accessibilityRole="radio" accessibilityLabel={text} accessibilityState={{ checked: v === value }} onPress={() => onChange(v)} style={{ flex: 1, paddingVertical: space(2), borderRadius: 9, backgroundColor: v === value ? colors.raised : "transparent", alignItems: "center" }}>
          <T variant="small" color={v === value ? colors.cream : colors.muted} style={{ fontFamily: fonts.semibold }}>
            {text}
          </T>
        </Pressable>
      ))}
    </View>
  );
}

/** A small pill that's on or off, e.g. "In my plan". */
export function Chip({ label, on, onPress, tone = colors.day }: { label: string; on: boolean; onPress: () => void; tone?: string }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={label} accessibilityState={{ checked: on }} onPress={onPress} style={{ paddingHorizontal: space(3.5), paddingVertical: space(2), borderRadius: 999, borderWidth: 1, borderColor: on ? tone : colors.line, backgroundColor: on ? tone : colors.surface }}>
      <T variant="small" color={on ? colors.ink : colors.cream} style={{ fontFamily: fonts.semibold }}>
        {label}
      </T>
    </Pressable>
  );
}
