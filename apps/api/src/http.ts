import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";

/** A JSON error body every endpoint shares: `{ error: { code, message, issues? } }`. */
export function fail(status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 502 | 503, code: string, message: string, issues?: unknown): never {
  throw new HTTPException(status, {
    res: new Response(JSON.stringify({ error: issues === undefined ? { code, message } : { code, message, issues } }), {
      status,
      headers: { "content-type": "application/json" },
    }),
  });
}

export async function body<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    fail(400, "invalid_json", "Request body must be JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) fail(400, "invalid_request", "Request body failed validation", parsed.error.issues);
  return parsed.data;
}

export function query<S extends z.ZodType>(c: Context, schema: S): z.infer<S> {
  const parsed = schema.safeParse(c.req.query());
  if (!parsed.success) fail(400, "invalid_request", "Query failed validation", parsed.error.issues);
  return parsed.data;
}
