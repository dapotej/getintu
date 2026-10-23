// Joining and signing in. Both confirm a phone number with a one-time code (by WhatsApp or SMS once
// those are set up; TEST numbers use a fixed code). Members can also sign in with an email they
// confirmed in Account. Whether an account exists is only said once the code is right, so nobody
// can look up who is a member.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button, Field, Notice, Screen, T, Wordmark } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { toE164 } from "@/lib/logic";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { colors, space } from "@/lib/theme";

type Mode = "join" | "member";
type Via = "phone" | "email";

const noSignal = (message: string) => (message.includes("fetch") ? "No signal. Try again when you're connected." : message);
const badCode = (message: string) => (/expired|invalid/i.test(message) ? "That code didn't work. Check it, or send a new one." : message);

export default function SignIn() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: Mode = params.mode === "join" ? "join" : "member";
  const router = useRouter();
  const { refreshMe, signOut } = useSession();
  const [via, setVia] = useState<Via>("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notMember, setNotMember] = useState(false);

  const startOver = async () => {
    if (notMember) await signOut();
    setSentTo(null);
    setCode("");
    setNotMember(false);
    setError(null);
  };

  const send = async () => {
    setError(null);
    if (via === "phone") {
      const e164 = toE164(phone);
      if (!e164) return setError("Enter your number with its country code, e.g. +44 7700 900123");
      setBusy(true);
      const { error: err } = await supabase.auth.signInWithOtp({ phone: e164 });
      setBusy(false);
      if (err) return setError(noSignal(err.message));
      return setSentTo(e164);
    }
    const address = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return setError("Enter your email address");
    setBusy(true);
    // Never makes an account: an email only signs in once a member has confirmed it.
    const { error: err } = await supabase.auth.signInWithOtp({ email: address, options: { shouldCreateUser: false } });
    setBusy(false);
    // An email on no account gets the same answer as one on an account.
    if (err && !/signups? not allowed|not found/i.test(err.message)) return setError(noSignal(err.message));
    setSentTo(address);
  };

  const verify = async () => {
    if (!sentTo) return;
    setBusy(true);
    setError(null);
    const { error: err } = via === "phone" ? await supabase.auth.verifyOtp({ phone: sentTo, token: code.trim(), type: "sms" }) : await supabase.auth.verifyOtp({ email: sentTo, token: code.trim(), type: "email" });
    if (err) {
      setBusy(false);
      return setError(badCode(err.message));
    }
    try {
      const me = await refreshMe();
      setBusy(false);
      if (me && !me.member && mode === "member") return setNotMember(true);
      if (me && !me.member) return router.replace("/setup");
      router.replace(me?.member && mode === "join" ? "/?back=1" : "/");
    } catch (e) {
      setBusy(false);
      // An email sign-in that isn't on a member account.
      await signOut();
      setSentTo(null);
      setCode("");
      setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
    }
  };

  const title = mode === "join" ? "Join intu" : "Welcome back";
  const intro = mode === "join" ? "Start with your phone number. We'll send you a code to confirm it." : via === "phone" ? "Sign in with your phone number. We'll send you a code." : "Sign in with the email you confirmed in your account. We'll send you a code.";

  return (
    <Screen>
      <View style={{ paddingTop: space(10), gap: space(2) }}>
        <Wordmark size={40} />
        <T variant="title" accessibilityRole="header">{title}</T>
        <T color={colors.muted}>{intro}</T>
      </View>
      {error ? <Notice>{error}</Notice> : null}
      {notMember ? (
        <>
          <Notice tone="day">We don&apos;t have an account for {sentTo}. Join intu with this number?</Notice>
          <Button label="Join intu" tone="day" onPress={() => router.replace("/setup")} />
          <Button label="Use a different number" tone="ghost" onPress={() => void startOver()} />
        </>
      ) : !sentTo ? (
        <>
          {via === "phone" ? (
            <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="+44 7700 900123" />
          ) : (
            <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" placeholder="you@example.com" />
          )}
          <Button label="Send code" onPress={send} busy={busy} disabled={via === "phone" ? !phone.trim() : !email.trim()} />
          {mode === "member" ? (
            <Button
              label={via === "phone" ? "Use email instead" : "Use phone number instead"}
              tone="ghost"
              onPress={() => {
                setVia(via === "phone" ? "email" : "phone");
                setError(null);
              }}
            />
          ) : null}
          <Button label={mode === "join" ? "Already a member? Sign in" : "New to intu? Join"} tone="ghost" onPress={() => router.replace(mode === "join" ? "/sign-in?mode=member" : "/sign-in?mode=join")} />
        </>
      ) : (
        <>
          <T color={colors.muted}>{via === "phone" ? `We sent a code to ${sentTo}.` : `If ${sentTo} is on an intu account, we've sent it a code.`}</T>
          <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={10} placeholder="123456" />
          <Button label={mode === "join" ? "Continue" : "Sign in"} onPress={verify} busy={busy} disabled={code.trim().length < 6} />
          <Button label={via === "phone" ? "Use a different number" : "Use a different email"} tone="ghost" onPress={() => void startOver()} />
        </>
      )}
    </Screen>
  );
}
