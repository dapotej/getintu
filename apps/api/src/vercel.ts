// The API as one Vercel function. Each instance keeps a single database connection: Vercel runs
// many instances side by side, and Supabase's pooler limits connections. After 20 quiet seconds
// the next request starts on a fresh connection, since the old one may have been dropped while
// the instance was paused.
import { getRequestListener } from "@hono/node-server";
import { loadEnv } from "./env.ts";
import { apiFromEnv, freshAfterQuiet } from "./runtime.ts";

const env = loadEnv();
export default getRequestListener(freshAfterQuiet(() => apiFromEnv(env, { poolSize: 1, connectTimeoutSeconds: 10 }), { quietMs: 20_000 }));
