// Phone sign-in: the number, then the one-time code sent to it (by WhatsApp or SMS once those are
// set up; TEST numbers use a fixed code).
import { useState } from "react";
import { View } from "react-native";
import { Button, Field, Notice, Screen, T, Wordmark } from "@/components/ui";
import { toE164 } from "@/lib/logic";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { colors, space } from "@/lib/theme";

export default function SignIn() {
  const { refreshMe } = useSession();
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    const e164 = toE164(phone);
    if (!e164) return setError("Enter your number with its country code, e.g. +44 7700 900123");
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOtp({ phone: e164 });
    setBusy(false);
    if (err) return setError(err.message.includes("fetch") ? "No signal. Try again when you're connected." : err.message);
    setSentTo(e164);
  };

  const verify = async () => {
    if (!sentTo) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ phone: sentTo, token: code.trim(), type: "sms" });
    if (err) {
      setBusy(false);
      return setError(err.message.toLowerCase().includes("expired") || err.message.toLowerCase().includes("invalid") ? "That code didn't work. Check it, or send a new one." : err.message);
    }
    await refreshMe().catch(() => null);
    setBusy(false);
  };

  return (
    <Screen>
      <View style={{ paddingTop: space(10), gap: space(2) }}>
        <Wordmark size={40} />
        <T variant="title" accessibilityRole="header">Your Lagos, day and night.</T>
        <T color={colors.muted}>Sign in with your phone number. We&apos;ll send you a code.</T>
      </View>
      {error ? <Notice>{error}</Notice> : null}
      {!sentTo ? (
        <>
          <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="+44 7700 900123" />
          <Button label="Send code" onPress={send} busy={busy} disabled={!phone.trim()} />
        </>
      ) : (
        <>
          <T color={colors.muted}>We sent a code to {sentTo}.</T>
          <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} placeholder="123456" />
          <Button label="Sign in" onPress={verify} busy={busy} disabled={code.trim().length < 6} />
          <Button
            label="Use a different number"
            tone="ghost"
            onPress={() => {
              setSentTo(null);
              setCode("");
            }}
          />
        </>
      )}
    </Screen>
  );
}
