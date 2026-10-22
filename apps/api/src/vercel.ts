// The API as one Vercel function. Each instance keeps a single database connection: Vercel runs
// many instances side by side, and Supabase's pooler limits connections.
import { getRequestListener } from "@hono/node-server";
import { loadEnv } from "./env.ts";
import { appFromEnv } from "./runtime.ts";

export default getRequestListener(appFromEnv(loadEnv(), { poolSize: 1 }).fetch);
