import { serve } from "@hono/node-server";
import { createDb } from "@intu/db";
import { createApp } from "./app.ts";
import { loadEnv } from "./env.ts";

const env = loadEnv();
const { db } = createDb(env.DATABASE_URL);
const app = createApp({ db });

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`intu API listening on http://localhost:${info.port}`);
});
