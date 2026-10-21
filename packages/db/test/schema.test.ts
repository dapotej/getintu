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
