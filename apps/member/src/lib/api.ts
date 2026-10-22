// Calls to the intu API with the member's sign-in. A failed connection is NoSignal, so screens can
// fall back to what they cached.
import { config } from "./config";
import { supabase } from "./supabase";

export class NoSignal extends Error {
  constructor() {
    super("No signal");
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 12_000;

export async function api<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(opts.body === undefined ? {} : { "content-type": "application/json" }) },
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
      signal: controller.signal,
    });
  } catch {
    throw new NoSignal();
  } finally {
    clearTimeout(timer);
  }
  const json = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
  if (!res.ok) throw new ApiError(res.status, json.error?.code ?? "error", json.error?.message ?? "Something went wrong");
  return json as T;
}

export const errorText = (err: unknown) => (err instanceof NoSignal ? "No signal. Try again when you're connected." : err instanceof Error ? err.message : "Something went wrong");
