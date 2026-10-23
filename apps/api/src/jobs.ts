// Scheduled jobs, called by the scheduler with JOBS_SECRET (a GitHub Actions schedule). Each is
// safe to run twice: a second run of the month's statements only adds visits not yet on one.
import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { previousMonth, toLagos } from "@intu/rules";
import { fail } from "./http.ts";
import type { SettlementService } from "./settlements/service.ts";

export function jobRoutes(deps: { secret: string | undefined; settlements: SettlementService; clock: () => Date }) {
  const app = new Hono();
  const allowed = (header: string) => {
    if (!deps.secret) return false;
    const given = Buffer.from(header.replace(/^Bearer /, ""));
    const want = Buffer.from(deps.secret);
    return given.length === want.length && timingSafeEqual(given, want);
  };

  // On the 1st of each month: last month's statements, as drafts for finance.
  app.post("/jobs/settlements", async (c) => {
    if (!deps.secret) fail(404, "not_configured", "Jobs aren't set up");
    if (!allowed(c.req.header("authorization") ?? "")) fail(401, "unauthenticated", "Wrong job secret");
    return c.json(await deps.settlements.run(previousMonth(toLagos(deps.clock()).date), { type: "system" }));
  });

  return app;
}
