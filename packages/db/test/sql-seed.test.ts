// The plain-SQL seed (sql/seed-test-data.sql, used for Supabase staging) must produce exactly what
// the TypeScript seed does. Builds both in throwaway databases and compares them.
import { readFileSync } from "node:fs";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { afterAll, describe, expect, it } from "vitest";
import { createDb, seed } from "../src/index.ts";

const url = process.env.DATABASE_URL;
const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;
const sqlSeed = readFileSync(new URL("../sql/seed-test-data.sql", import.meta.url), "utf8");
const sqlReset = readFileSync(new URL("../sql/reset-test-data.sql", import.meta.url), "utf8");

const FINGERPRINT = `
  select
    (select count(*) from partners)||'/'||(select count(*) from venues)||'/'||(select count(*) from offers)||'/'||
    (select count(*) from plans)||'/'||(select count(*) from plan_prices)||'/'||(select count(*) from benefits)||'/'||
    (select count(*) from members)||'/'||(select count(*) from memberships)||'/'||(select count(*) from allowances)||'/'||
    (select count(*) from audit_log) as counts,
    (select md5(string_agg(r, '|' order by r)) from (select p.code||c.code||coalesce(b.quantity::text,'-')||b.shared_by_group||b.draw_per_person||b.allowed_venue_tiers::text||b.cap_once_per_venue_per_day||b.cost_basis||coalesce(b.planned_cost_minor::text,'-')||b.expected_use_pct as r from benefits b join plans p on p.id = b.plan_id join categories c on c.id = b.category_id) x) as benefits,
    (select md5(string_agg(r, '|' order by r)) from (select coalesce(a.membership_id::text, 'g:'||a.group_id)||p.code||c.code||coalesce(a.granted::text,'-')||a.period_start||a.period_end||a.used as r from allowances a join benefits b on b.id = a.benefit_id join plans p on p.id = b.plan_id join categories c on c.id = b.category_id) x) as allowances,
    (select md5(string_agg(r, '|' order by r)) from (select v.id::text||v.name||v.opening_hours::text||v.tier||(select code from categories where id = v.category_id)||coalesce(v.login_code,'-') as r from venues v) x) as venues,
    (select md5(string_agg(r, '|' order by r)) from (select o.id::text||o.venue_id::text||(select code from categories where id = o.category_id)||o.rate_minor||coalesce(o.retail_minor::text,'-')||o.prices_are_placeholders||coalesce(o.daily_cap::text,'-') as r from offers o) x) as offers,
    (select md5(string_agg(r, '|' order by r)) from (select m.id::text||m.full_name||m.phone||coalesce(m.email,'')||coalesce(m.country,'') as r from members m) x) as members,
    (select md5(string_agg(r, '|' order by r)) from (select p.code||pp.currency||pp.amount_minor as r from plan_prices pp join plans p on p.id = pp.plan_id) x) as prices,
    (select string_agg(p.code||':'||p.overhead_per_member_minor, '|' order by p.code) from plans p) as overheads,
    (select string_agg(currency||':'||kobo_per_unit, '|' order by currency) from fx_rates) as fx,
    (select md5(string_agg(s.id::text||s.role||s.full_name||coalesce(s.pin_hash,'-')||coalesce(v.venue_id::text,'-'), '|' order by s.id)) from staff_users s left join staff_user_venues v on v.staff_user_id = s.id) as staff,
    (select md5(string_agg(r, '|' order by r)) from (select p.id::text||p.legal_name as r from partners p) x) as partners`;

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

  it("resets: removes every TEST row, then the seed loads the same set again", async () => {
    const { sql } = createDb(dbUrl(names.sql), { max: 1 });
    const [before] = await sql.unsafe(FINGERPRINT);
    await sql.unsafe(sqlReset);
    const [left] = await sql.unsafe(`select
      (select count(*) from partners where is_test) + (select count(*) from venues where is_test) + (select count(*) from offers where is_test) +
      (select count(*) from plans where is_test) + (select count(*) from members where is_test) + (select count(*) from staff_users where is_test) + (select count(*) from memberships) + (select count(*) from allowances) as n`);
    expect(Number(left?.n)).toBe(0);
    await sql.unsafe(sqlSeed);
    const [after] = await sql.unsafe(FINGERPRINT);
    // The audit log is append-only, so only its count grows.
    const withoutAudit = (f: Record<string, unknown> | undefined) => ({ ...f, counts: String(f?.counts).replace(/\/\d+$/, "") });
    expect(withoutAudit(after)).toEqual(withoutAudit(before));
    await sql.end();
  });
});
