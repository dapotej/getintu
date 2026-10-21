"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly issues?: { path: (string | number)[]; message: string }[],
  ) {
    super(message);
  }
}

const base = () => process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${base()}${path}`, {
    method: init.method ?? "GET",
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string; issues?: ApiError["issues"] } };
  if (!res.ok) throw new ApiError(res.status, json.error?.code ?? "error", json.error?.message ?? `Request failed (${res.status})`, json.error?.issues);
  return json as T;
}

/** A readable message for an API error, including the first validation problem if there is one. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const issue = err.issues?.[0];
    return issue ? `${err.message}: ${issue.path.join(".")} – ${issue.message}` : err.message;
  }
  return err instanceof Error ? err.message : "Something went wrong";
}

/** Loads `path` and keeps it fresh; `reload()` refetches after a change. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return;
    let live = true;
    setLoading(true);
    api<T>(path)
      .then((d) => live && (setData(d), setError(null)))
      .catch((e: unknown) => live && setError(errorMessage(e)))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}
