"use client";
import { Button, Field, Input, Notice } from "@intu/ui";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.signInWithPassword({ email: String(form.get("email")), password: String(form.get("password")) });
    setBusy(false);
    if (error) return setError("That email and password don't match an account.");
    router.replace("/two-step");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
        <p className="mt-1 text-sm text-muted">Use your intu team account. You'll confirm with your authenticator app next.</p>
      </div>
      {error ? <Notice>{error}</Notice> : null}
      <Field label="Email">
        <Input name="email" type="email" autoComplete="username" required />
      </Field>
      <Field label="Password">
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Signing in…" : "Continue"}
      </Button>
    </form>
  );
}
