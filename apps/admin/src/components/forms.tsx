"use client";
import { Notice } from "@intu/ui";
import { useState, type FormEvent, type ReactNode } from "react";
import { errorMessage } from "@/lib/api";

/** A form that runs an async action, shows its error, and disables itself while busy. */
export function ActionForm({ action, children, className, success }: { action: (form: FormData) => Promise<unknown>; children: (busy: boolean) => ReactNode; className?: string; success?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await action(new FormData(form));
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className={className ?? "flex flex-col gap-4"}>
      {error ? <Notice>{error}</Notice> : null}
      {done && success ? <Notice tone="success">{success}</Notice> : null}
      {children(busy)}
    </form>
  );
}

export const text = (form: FormData, name: string) => String(form.get(name) ?? "").trim();
export const textOrNull = (form: FormData, name: string) => text(form, name) || null;
export const intOrNull = (form: FormData, name: string) => (text(form, name) === "" ? null : Number(text(form, name)));
export const checked = (form: FormData, name: string) => form.get(name) === "on";

/** "6.4262, 3.4486" as pasted from a map → latitude and longitude; blank → both null. */
export function readLocation(form: FormData, name: string): { latitude: number | null; longitude: number | null } {
  const raw = text(form, name);
  if (!raw) return { latitude: null, longitude: null };
  const parts = raw.split(/[,\s]+/).filter(Boolean).map(Number);
  const [latitude, longitude] = parts;
  if (parts.length !== 2 || latitude === undefined || longitude === undefined || parts.some((n) => !Number.isFinite(n))) {
    throw new Error("Map location: paste the latitude and longitude, e.g. 6.4262, 3.4486");
  }
  return { latitude, longitude };
}
export const locationText = (v: { latitude: number | null; longitude: number | null }) => (v.latitude === null || v.longitude === null ? "" : `${v.latitude}, ${v.longitude}`);
