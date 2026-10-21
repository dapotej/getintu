"use client";
import { Button, Field, Input, Notice } from "@intu/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

type Step = { kind: "loading" } | { kind: "verify"; factorId: string } | { kind: "enrol"; factorId: string; qr: string; secret: string };

/**
 * Two-step verification with an authenticator app (TOTP). First sign-in enrols one; every
 * sign-in after that asks for a code. The API refuses admin requests until this is done.
 */
export default function TwoStepPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const auth = supabase().auth;
    (async () => {
      const { data: session } = await auth.getSession();
      if (!session.session) return router.replace("/login");
      const { data: aal } = await auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.currentLevel === "aal2") return router.replace("/");
      const { data: factors, error } = await auth.mfa.listFactors();
      if (error) return setError(error.message);
      const verified = factors.totp.find((f) => f.status === "verified");
      if (verified) return setStep({ kind: "verify", factorId: verified.id });
      // Clear any half-finished enrolment before starting a new one.
      for (const f of factors.all.filter((f) => f.status === "unverified")) await auth.mfa.unenroll({ factorId: f.id });
      const { data: enrolled, error: enrolError } = await auth.mfa.enroll({ factorType: "totp", friendlyName: `intu admin ${new Date().toISOString().slice(0, 10)}` });
      if (enrolError) return setError(enrolError.message);
      setStep({ kind: "enrol", factorId: enrolled.id, qr: enrolled.totp.qr_code, secret: enrolled.totp.secret });
    })();
  }, [router]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (step.kind === "loading") return;
    const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.mfa.challengeAndVerify({ factorId: step.factorId, code });
    setBusy(false);
    if (error) return setError("That code didn't work. Check your authenticator app and try the newest code.");
    router.replace("/");
  }

  if (step.kind === "loading") return error ? <Notice>{error}</Notice> : <p className="text-sm text-cream-muted">Loading…</p>;

  return (
    <form onSubmit={submit} className="space-y-4">
      <h1 className="text-lg font-bold">{step.kind === "enrol" ? "Set up two-step verification" : "Two-step verification"}</h1>
      {step.kind === "enrol" ? (
        <div className="space-y-3 text-sm text-cream-muted">
          <p>Scan this with an authenticator app (Google Authenticator, 1Password, Authy), then enter the 6-digit code it shows.</p>
          {/* Supabase returns the QR code as an SVG data URL. */}
          <img src={step.qr} alt="QR code for your authenticator app" className="mx-auto size-44 rounded-lg bg-cream p-2" />
          <p className="break-all text-center text-xs">
            Or enter this key: <code className="text-cream">{step.secret}</code>
          </p>
        </div>
      ) : (
        <p className="text-sm text-cream-muted">Enter the 6-digit code from your authenticator app.</p>
      )}
      {error ? <Notice>{error}</Notice> : null}
      <Field label="Code">
        <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required autoFocus />
      </Field>
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Checking…" : "Verify"}
      </Button>
      <button type="button" className="w-full text-xs text-cream-muted underline" onClick={() => supabase().auth.signOut().then(() => router.replace("/login"))}>
        Use a different account
      </button>
    </form>
  );
}
