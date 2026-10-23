// Turning on email sign-in: confirms the member's email with a code, which adds it to their
// account. From then on they can sign in with either their phone or that email.
import { useRouter } from "expo-router";
import { useState } from "react";
import { Button, Card, Field, Notice, T } from "@/components/ui";
import { useSession } from "@/lib/session";
import { supabase } from "@/lib/supabase";
import { colors } from "@/lib/theme";

export function EmailSignIn() {
  const { me, refreshMe } = useSession();
  const router = useRouter();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const email = me?.member?.email?.trim().toLowerCase() ?? null;
  const on = me?.signInEmail?.toLowerCase() ?? null;

  const send = async () => {
    if (!email) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ email });
    setBusy(false);
    if (err) return setError(/already|exists|registered/i.test(err.message) ? "That email is already used by another account. Message the concierge for help." : err.message);
    setSentTo(email);
  };

  const verify = async () => {
    if (!sentTo) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.verifyOtp({ email: sentTo, token: code.trim(), type: "email_change" });
    if (err) {
      setBusy(false);
      return setError(/expired|invalid/i.test(err.message) ? "That code didn't work. Check it, or send a new one." : err.message);
    }
    // The new token carries the email.
    await supabase.auth.refreshSession().catch(() => null);
    await refreshMe().catch(() => null);
    setBusy(false);
    setSentTo(null);
    setCode("");
  };

  return (
    <Card>
      <T variant="heading">Sign in with email</T>
      {on && on === email ? (
        <T color={colors.muted}>On. You can sign in with {on} or your phone number.</T>
      ) : !email ? (
        <>
          <T color={colors.muted}>Add your email to your details, then confirm it here to sign in with it as well as your phone.</T>
          <Button label="Add your email" tone="secondary" onPress={() => router.push("/setup")} />
        </>
      ) : sentTo ? (
        <>
          <T color={colors.muted}>We sent a code to {sentTo}.</T>
          <Field label="Email code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" maxLength={10} placeholder="123456" />
          <Button label="Confirm email" busy={busy} disabled={code.trim().length < 6} onPress={() => void verify()} />
          <Button label="Cancel" tone="ghost" onPress={() => setSentTo(null)} />
        </>
      ) : (
        <>
          <T color={colors.muted}>{on ? `You sign in with ${on}. Confirm ${email} to use it instead.` : `Confirm ${email} to sign in with it as well as your phone number.`}</T>
          <Button label={`Send a code to ${email}`} tone="secondary" busy={busy} onPress={() => void send()} />
        </>
      )}
      {error ? <Notice>{error}</Notice> : null}
    </Card>
  );
}
