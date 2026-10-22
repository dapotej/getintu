// The plain-SQL seed (sql/seed-test-data.sql, used for Supabase staging) must produce exactly what
// the TypeScript seed does. Builds both in throwaway databases and compares them.
import { readFileSync } from "node:fs";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, describe, expect, it } from "vitest";
import { createDb, seed } from "../src/index.ts";

const url = process.env.DATABASE_URL;
const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
const sqlSeed = readFileSync(new URL("../sql/seed-test-data.sql", import.meta.url), "utf8");

const FINGERPRINT = `
  select
    (select count(*) from partners)||'/'||(select count(*) from venues)||'/'||(select count(*) from offers)||'/'||
    (select count(*) from plans)||'/'||(select count(*) from plan_prices)||'/'||(select count(*) from benefits)||'/'||
    (select count(*) from members)||'/'||(select count(*) from memberships)||'/'||(select count(*) from allowances)||'/'||
    (select count(*) from audit_log) as counts,
    (select md5(string_agg(r, '|' order by r)) from (select p.code||c.code||coalesce(b.quantity::text,'-')||b.shared_by_group||b.draw_per_person||b.allowed_venue_tiers::text||b.cap_once_per_venue_per_day as r from benefits b join plans p on p.id = b.plan_id join categories c on c.id = b.category_id) x) as benefits,
    (select md5(string_agg(r, '|' order by r)) from (select coalesce(a.membership_id::text, 'g:'||a.group_id)||p.code||c.code||coalesce(a.granted::text,'-')||a.period_start||a.period_end||a.used as r from allowances a join benefits b on b.id = a.benefit_id join plans p on p.id = b.plan_id join categories c on c.id = b.category_id) x) as allowances,
    (select md5(string_agg(r, '|' order by r)) from (select v.id::text||v.name||v.opening_hours::text||v.tier||v.category as r from venues v) x) as venues,
    (select md5(string_agg(r, '|' order by r)) from (select o.id::text||o.venue_id::text||(select code from categories where id = o.category_id)||o.rate_minor||coalesce(o.retail_minor::text,'-')||o.prices_are_placeholders||coalesce(o.daily_cap::text,'-') as r from offers o) x) as offers,
    (select md5(string_agg(r, '|' order by r)) from (select m.id::text||m.full_name||m.phone||coalesce(m.email,'')||coalesce(m.country,'') as r from members m) x) as members,
    (select md5(string_agg(r, '|' order by r)) from (select p.code||pp.currency||pp.amount_minor as r from plan_prices pp join plans p on p.id = pp.plan_id) x) as prices,
    (select md5(string_agg(r, '|' order by r)) from (select p.id::text||p.status||p.legal_name as r from partners p) x) as partners`;

describe.runIf(url)("SQL seed", () => {
  const admin = createDb(url ?? "", { max: 1 });
  const suffix = `${process.pid}_${Date.now()}`;
  const names = { ts: `intu_seedcheck_ts_${suffix}`, sql: `intu_seedcheck_sql_${suffix}` };
  const dbUrl = (name: string) => {
    const u = new URL(url ?? "");
    u.pathname = `/${name}`;
    return u.toString();
  };

  afterAll(async () => {
    for (const name of Object.values(names)) await admin.sql.unsafe(`drop database if exists ${name} with (force)`);
    await admin.sql.end();
  });

  it("matches the TypeScript seed, and is safe to run twice", async () => {
    const fingerprints = [];
    for (const [kind, name] of Object.entries(names)) {
      await admin.sql.unsafe(`create database ${name}`);
      const { db, sql } = createDb(dbUrl(name), { max: 1 });
      await migrate(db, { migrationsFolder });
      if (kind === "ts") {
        await seed(db);
      } else {
        await sql.unsafe(sqlSeed);
        await sql.unsafe(sqlSeed);
      }
      fingerprints.push((await sql.unsafe(FINGERPRINT))[0]);
      await sql.end();
    }
    expect(fingerprints[1]).toEqual(fingerprints[0]);
  });
});
