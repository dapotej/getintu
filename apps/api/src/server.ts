import { serve } from "@hono/node-server";
import { loadEnv } from "./env.ts";
import { appFromEnv } from "./runtime.ts";

const env = loadEnv();
const app = appFromEnv(env);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`intu API listening on http://localhost:${info.port}`);
});
