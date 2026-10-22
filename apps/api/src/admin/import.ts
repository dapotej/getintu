import { Hono } from "hono";
import { z } from "zod";
import type { Db } from "@intu/db";
import { requirePermission, type AdminEnv } from "../auth/staff.ts";
import { body } from "../http.ts";
import { importPartnerPipeline } from "../import/partners.ts";
import { importPilot } from "../import/pilot.ts";
import { uuid } from "./validation.ts";

const csv = z.string().max(5_000_000).optional();
const PilotImport = z.object({
  files: z.object({ partners: csv, members: csv, allowances: csv, visits: csv, bookings: csv }),
  tierPlans: z.record(z.string().min(1).max(40), uuid),
  dateOrder: z.enum(["ISO", "DMY", "MDY"]),
  dryRun: z.boolean(),
});

export function importRoutes(db: Db) {
  const app = new Hono<AdminEnv>();

  // Always try a dry run first: it returns the full report and changes nothing.
  app.post("/import/pilot", requirePermission("import.pilot"), async (c) => {
    const input = await body(c, PilotImport);
    const staff = c.get("staff");
    const report = await importPilot(db, { ...input, actor: { type: "staff", id: staff.id } });
    return c.json({ report }, report.errors.length && !input.dryRun ? 422 : 200);
  });

  // The partner database sheet's "Lagos Partner Pipeline" tab.
  app.post("/import/partners", requirePermission("partners.write"), async (c) => {
    const input = await body(c, z.object({ csv: z.string().min(1).max(5_000_000), dryRun: z.boolean() }));
    const staff = c.get("staff");
    const report = await importPartnerPipeline(db, { ...input, actor: { type: "staff", id: staff.id } });
    return c.json({ report }, report.errors.length && !input.dryRun ? 422 : 200);
  });

  return app;
}
