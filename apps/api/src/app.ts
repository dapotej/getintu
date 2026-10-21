import { Hono } from "hono";
import { z } from "zod";
import { sql, type Db } from "@intu/db";

const HealthResponse = z.object({ status: z.enum(["ok", "degraded"]), database: z.enum(["ok", "down"]) });

export function createApp(deps: { db: Db }) {
  const app = new Hono();

  app.get("/health", async (c) => {
    let database: "ok" | "down" = "ok";
    try {
      await deps.db.execute(sql`select 1`);
    } catch {
      database = "down";
    }
    const body = HealthResponse.parse({ status: database === "ok" ? "ok" : "degraded", database });
    return c.json(body, database === "ok" ? 200 : 503);
  });

  return app;
}
