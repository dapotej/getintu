import { afterAll, describe, expect, it } from "vitest";
import { createDb } from "../src/index.ts";

const url = process.env.DATABASE_URL;

describe.runIf(url)("schema safety", () => {
  const { sql } = createDb(url ?? "", { max: 1 });
  afterAll(() => sql.end());

  it("has row-level security on every public table, so Supabase's public API can't reach them", async () => {
    const rows = await sql<{ tablename: string }[]>`
      select c.relname as tablename from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`;
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });
});

describe.runIf(url)("catalogue", () => {
  const { sql } = createDb(url ?? "", { max: 1 });
  afterAll(() => sql.end());

  it("matches src/taxonomy.ts: every code, name, level and parent", async () => {
    const { flattenTaxonomy } = await import("../src/taxonomy.ts");
    const rows = await sql<{ code: string; name: string; level: string; parent: string | null }[]>`
      select c.code, c.name, c.level, p.code as parent from categories c left join categories p on p.id = c.parent_id order by c.code`;
    const expected = flattenTaxonomy()
      .map((r) => ({ code: r.code, name: r.name, level: r.level, parent: r.parentCode }))
      .sort((a, b) => a.code.localeCompare(b.code));
    // Staff can add entries in the console; the original catalogue must all be there, unchanged.
    expect(rows.filter((r) => expected.some((e) => e.code === r.code))).toEqual(expected);
  });
});
