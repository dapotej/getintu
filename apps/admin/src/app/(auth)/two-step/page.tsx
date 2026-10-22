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

  if (step.kind === "loading") return error ? <Notice>{error}</Notice> : <p className="text-sm text-muted">Loading…</p>;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{step.kind === "enrol" ? "Set up two-step verification" : "Two-step verification"}</h1>
        <p className="mt-1 text-sm text-muted">
          {step.kind === "enrol" ? "Scan this with an authenticator app (Google Authenticator, 1Password, Authy), then enter the 6-digit code it shows." : "Enter the 6-digit code from your authenticator app."}
        </p>
      </div>
      {step.kind === "enrol" ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-line bg-surface p-5 shadow-card">
          {/* Supabase returns the QR code as an SVG data URL. */}
          <img src={step.qr} alt="QR code for your authenticator app" className="size-44 rounded-lg bg-white p-2" />
          <p className="break-all text-center text-xs text-muted">
            Or enter this key: <code className="font-semibold text-fg">{step.secret}</code>
          </p>
        </div>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      <Field label="Code">
        <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" required autoFocus className="text-center text-lg tracking-[0.4em] tabular-nums" />
      </Field>
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Checking…" : "Verify"}
      </Button>
      <button type="button" className="text-sm font-medium text-muted hover:text-fg" onClick={() => supabase().auth.signOut().then(() => router.replace("/login"))}>
        Use a different account
      </button>
    </form>
  );
}
