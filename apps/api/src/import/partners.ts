// Imports the "Lagos Partner Pipeline" tab (exported as CSV) into partners, so the pipeline lives
// in the console rather than a spreadsheet. A dry run, or any error, changes nothing. Running it
// again updates partners already imported (matched by name) instead of duplicating them.
import { and, eq, ilike, isNull } from "drizzle-orm";
import { audit, one, schema, type Db } from "@intu/db";
import { parsePipeline, type PipelineImportReport } from "./pipeline.ts";

export { parsePipeline, PLACEHOLDER_COST_MINOR, type PipelineImportReport, type PipelineRow } from "./pipeline.ts";

const { partners, categories } = schema;

class Rollback extends Error {}

export async function importPartnerPipeline(db: Db, input: { csv: string; dryRun: boolean; actor: { type: "staff" | "system"; id?: string } }): Promise<PipelineImportReport> {
  const tree = await db.select().from(categories);
  const { rows, warnings, errors } = parsePipeline(input.csv, tree);
  const report: PipelineImportReport = { dryRun: input.dryRun, committed: false, counts: { created: 0, updated: 0, unchanged: 0 }, warnings, errors };
  if (errors.some((e) => e.line === 1)) return report;

  try {
    await db.transaction(async (tx) => {
      for (const { name, values } of rows) {
        const [existing] = await tx
          .select()
          .from(partners)
          .where(and(ilike(partners.tradingName, name.replace(/[%_\\]/g, (m) => `\\${m}`)), isNull(partners.deletedAt)));
        if (!existing) {
          const created = one(await tx.insert(partners).values({ legalName: name, tradingName: name, ...values }).returning());
          await audit(tx, input.actor, { action: "partner.imported", entity: "partner", entityId: created.id, after: created });
          report.counts.created++;
          continue;
        }
        const changed = (Object.keys(values) as (keyof typeof values)[]).some((k) => existing[k] !== values[k]);
        if (!changed) {
          report.counts.unchanged++;
          continue;
        }
        const after = one(await tx.update(partners).set(values).where(eq(partners.id, existing.id)).returning());
        await audit(tx, input.actor, { action: "partner.pipeline_imported", entity: "partner", entityId: existing.id, before: existing, after });
        report.counts.updated++;
      }
      if (input.dryRun || report.errors.length) throw new Rollback();
    });
    report.committed = true;
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }
  return report;
}
