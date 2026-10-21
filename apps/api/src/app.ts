import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { sql } from "drizzle-orm";
import { z, ZodError } from "zod";
import type { Db } from "@intu/db";
import { importRoutes } from "./admin/import.ts";
import { memberRoutes } from "./admin/members.ts";
import { partnerRoutes } from "./admin/partners.ts";
import { planRoutes } from "./admin/plans.ts";
import { staffRoutes } from "./admin/staff.ts";
import { requireStaff, type AdminEnv } from "./auth/staff.ts";
import type { AuthAdmin } from "./auth/supabase-admin.ts";
import type { TokenVerifier } from "./auth/tokens.ts";

const HealthResponse = z.object({ status: z.enum(["ok", "degraded"]), database: z.enum(["ok", "down"]) });

export interface AppDeps {
  db: Db;
  verify: TokenVerifier;
  authAdmin: AuthAdmin;
  corsOrigins?: string[];
  inviteRedirectUrl?: string | undefined;
}

export function createApp(deps: AppDeps) {
  const app = new Hono();

  app.use("*", cors({ origin: deps.corsOrigins ?? [], allowHeaders: ["authorization", "content-type"], allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE"] }));

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    if (err instanceof ZodError) return c.json({ error: { code: "invalid_request", message: "Request failed validation", issues: err.issues } }, 400);
    console.error(err);
    return c.json({ error: { code: "internal", message: "Something went wrong" } }, 500);
  });

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

  const admin = new Hono<AdminEnv>();
  admin.use("*", requireStaff(deps));
  admin.route("/", staffRoutes(deps));
  admin.route("/", planRoutes(deps.db));
  admin.route("/", partnerRoutes(deps.db));
  admin.route("/", memberRoutes(deps.db));
  admin.route("/", importRoutes(deps.db));
  app.route("/admin", admin);

  return app;
}
