// A new member's details, or a member editing theirs. Setting up needs the terms accepted.
import { useState } from "react";
import { Button, Check, Field, Notice, Screen, T } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import { useSession } from "@/lib/session";
import { colors } from "@/lib/theme";

export default function Setup() {
  const { me, refreshMe } = useSession();
  const existing = me?.member ?? null;
  const [fullName, setFullName] = useState(existing?.fullName ?? "");
  const [email, setEmail] = useState(existing?.email ?? "");
  const [country, setCountry] = useState(existing?.country ?? "");
  const [marketing, setMarketing] = useState(existing?.consentMarketing ?? false);
  const [terms, setTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await api("/me", { method: "PUT", body: { fullName: fullName.trim(), email: email.trim() || null, country: country.trim().toUpperCase() || null, consentMarketing: marketing, ...(existing ? {} : { acceptTerms: terms }) } });
      await refreshMe();
      setSaved(Boolean(existing));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      {existing ? null : (
        <>
          <T variant="title" accessibilityRole="header">Welcome to intu</T>
          <T color={colors.muted}>Tell us who you are. Venues see your name and photo, nothing else.</T>
        </>
      )}
      {error ? <Notice>{error}</Notice> : null}
      {saved ? <Notice tone="muted">Saved.</Notice> : null}
      <Field label="Full name" value={fullName} onChangeText={setFullName} autoComplete="name" textContentType="name" />
      <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" hint="For receipts. Optional. Confirm it in Account to sign in with it too." />
      <Field label="Country" value={country} onChangeText={setCountry} autoCapitalize="characters" maxLength={2} placeholder="GB" hint="Where you live, as two letters: GB, US, NG…" />
      <Check label="Send me intu news and offers" checked={marketing} onChange={setMarketing} />
      {existing ? null : <Check label="I agree to the intu terms and privacy notice" checked={terms} onChange={setTerms} />}
      <Button label={existing ? "Save" : "Continue"} onPress={save} busy={busy} disabled={fullName.trim().length < 2 || (!existing && !terms)} />
    </Screen>
  );
}
