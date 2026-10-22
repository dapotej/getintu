// Calls to the intu API. A request that can't reach the server throws NoSignal, so the scanner
// can switch to its offline checks; a server answer that isn't OK throws ApiError.
const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class NoSignal extends Error {}

export async function api<T>(path: string, opts: { method?: string; body?: unknown; token?: string | undefined; timeoutMs?: number } = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 8000);
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers: { ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}), ...(opts.body === undefined ? {} : { "content-type": "application/json" }) },
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) }),
      signal: controller.signal,
      cache: "no-store",
    });
  } catch {
    throw new NoSignal("No signal");
  } finally {
    clearTimeout(timer);
  }
  const json = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
  if (!res.ok) throw new ApiError(res.status, json.error?.code ?? "error", json.error?.message ?? "Something went wrong");
  return json as T;
}
