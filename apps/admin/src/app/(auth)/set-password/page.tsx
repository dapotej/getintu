"use client";
import { Button, Field, Input, Notice } from "@intu/ui";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

/** Where invitation emails land: choose a password, then set up two-step. */
export default function SetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // supabase-js picks the invitation session up from the link automatically.
    supabase()
      .auth.getSession()
      .then(({ data }) => setReady(Boolean(data.session)));
  }, []);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    if (password.length < 12) return setError("Use at least 12 characters.");
    if (password !== String(form.get("confirm"))) return setError("The two passwords don't match.");
    setBusy(true);
    const { error } = await supabase().auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace("/two-step");
  }

  if (ready === null) return <p className="text-sm text-muted">Loading…</p>;
  if (!ready) return <Notice>This invitation link has expired or was already used. Ask an ops lead to send a new one.</Notice>;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Choose a password</h1>
        <p className="mt-1 text-sm text-muted">Welcome to the intu team. After this you'll set up two-step verification.</p>
      </div>
      {error ? <Notice>{error}</Notice> : null}
      <Field label="New password" hint="At least 12 characters.">
        <Input name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm password">
        <Input name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Saving…" : "Save and continue"}
      </Button>
    </form>
  );
}
