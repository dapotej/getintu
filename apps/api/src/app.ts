import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { sql } from "drizzle-orm";
import { z, ZodError } from "zod";
import type { Db } from "@intu/db";
import { bookingRoutes } from "./admin/bookings.ts";
import { categoryRoutes } from "./admin/categories.ts";
import { importRoutes } from "./admin/import.ts";
import { memberRoutes } from "./admin/members.ts";
import { partnerRoutes } from "./admin/partners.ts";
import { planRoutes } from "./admin/plans.ts";
import { scannerAdminRoutes } from "./admin/scanner.ts";
import { staffRoutes } from "./admin/staff.ts";
import { requireStaff, type AdminEnv } from "./auth/staff.ts";
import { memberAppRoutes } from "./member/routes.ts";
import type { PhotoStore } from "./member/photos.ts";
import { smsHookRoutes, testSender, type CodeSender } from "./member/sms-hook.ts";
import { scannerRoutes } from "./partner/routes.ts";
import type { PassKeys } from "./passes.ts";
import type { AuthAdmin } from "./auth/supabase-admin.ts";
import type { TokenVerifier } from "./auth/tokens.ts";

const HealthResponse = z.object({ status: z.enum(["ok", "degraded"]), database: z.enum(["ok", "down"]) });

export interface AppDeps {
  db: Db;
  verify: TokenVerifier;
  authAdmin: AuthAdmin;
  corsOrigins?: string[];
  inviteRedirectUrl?: string | undefined;
  /** Signs member passes; scanners trust the public halves. */
  passKeys: PassKeys;
  /** Signs partner staff shift sessions. */
  partnerSessionSecret: string;
  /** Member photos, in private storage. */
  photos: PhotoStore;
  /** The member app: concierge and doctor-on-call numbers, and whether sign-ups are TEST data. */
  memberApp?: { conciergeWhatsApp: string | null; doctorOnCallPhone: string | null; newMembersAreTest: boolean };
  /** Supabase's Send SMS hook: its signing secret, and who delivers sign-in codes. */
  smsHook?: { secret: string | undefined; sender?: CodeSender };
  /** The time, replaceable in tests. */
  clock?: () => Date;
}

export function createApp(deps: AppDeps) {
  const app = new Hono();

  // Browsers may cache the pre-flight check for 10 minutes, so a scan on a slow network is one round trip, not two.
  app.use("*", cors({ origin: deps.corsOrigins ?? [], allowHeaders: ["authorization", "content-type"], allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE"], maxAge: 600 }));

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

  const clock = deps.clock ?? (() => new Date());
  app.route("/", scannerRoutes({ db: deps.db, passKeys: deps.passKeys, partnerSessionSecret: deps.partnerSessionSecret, photos: deps.photos, clock }));
  app.route("/", smsHookRoutes({ secret: deps.smsHook?.secret, sender: deps.smsHook?.sender ?? testSender, clock }));
  app.route(
    "/",
    memberAppRoutes({
      db: deps.db,
      verify: deps.verify,
      passKeys: deps.passKeys,
      photos: deps.photos,
      clock,
      conciergeWhatsApp: deps.memberApp?.conciergeWhatsApp ?? null,
      doctorOnCallPhone: deps.memberApp?.doctorOnCallPhone ?? null,
      newMembersAreTest: deps.memberApp?.newMembersAreTest ?? true,
    }),
  );

  const admin = new Hono<AdminEnv>();
  admin.use("*", requireStaff(deps));
  admin.route("/", staffRoutes(deps));
  admin.route("/", categoryRoutes(deps.db));
  admin.route("/", planRoutes(deps.db));
  admin.route("/", partnerRoutes(deps.db));
  admin.route("/", memberRoutes(deps.db));
  admin.route("/", importRoutes(deps.db));
  admin.route("/", scannerAdminRoutes({ db: deps.db, passKeys: deps.passKeys, clock }));
  admin.route("/", bookingRoutes({ db: deps.db, clock }));
  app.route("/admin", admin);

  return app;
}
