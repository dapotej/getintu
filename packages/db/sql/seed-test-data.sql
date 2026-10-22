-- TEST seed data as plain SQL, for databases this repo can't reach with a connection string
-- (e.g. Supabase staging through the dashboard or connector). Mirrors src/seed-data.ts and
-- grantAllowances() for per-pass benefits. Every name starts with TEST; phones are fiction-reserved.
-- Needs migrations 0000-0010: the catalogue (categories) comes from migration 0009.
-- Safe to run twice: existing rows are left alone.
BEGIN;

INSERT INTO partners (id, legal_name, trading_name, contact_email, settlement_terms, is_test) VALUES
  ('00000000-0000-4000-8000-000000000101', 'TEST Coastline Leisure Ltd', 'TEST Coastline', 'ops+101@example.com', 'TEST: monthly in arrears', true),
  ('00000000-0000-4000-8000-000000000102', 'TEST Island Hotels Ltd', 'TEST Island Hotels', 'ops+102@example.com', 'TEST: monthly in arrears', true),
  ('00000000-0000-4000-8000-000000000103', 'TEST Lagoon Golf Ltd', 'TEST Lagoon Golf', 'ops+103@example.com', 'TEST: monthly in arrears', true),
  ('00000000-0000-4000-8000-000000000104', 'TEST Afterdark Ltd', 'TEST Afterdark', 'ops+104@example.com', 'TEST: monthly in arrears', true)
ON CONFLICT DO NOTHING;

WITH h(name, hours) AS (VALUES
  ('beach1', '{"0":[{"open":"10:00","close":"19:00"}],"1":[{"open":"10:00","close":"19:00"}],"2":[{"open":"10:00","close":"19:00"}],"3":[{"open":"10:00","close":"19:00"}],"4":[{"open":"10:00","close":"19:00"}],"5":[{"open":"10:00","close":"19:00"}],"6":[{"open":"10:00","close":"19:00"}]}'::jsonb),
  ('beach2', '{"0":[{"open":"09:00","close":"18:00"}],"1":[{"open":"09:00","close":"18:00"}],"2":[{"open":"09:00","close":"18:00"}],"3":[{"open":"09:00","close":"18:00"}],"4":[{"open":"09:00","close":"18:00"}],"5":[{"open":"09:00","close":"18:00"}],"6":[{"open":"09:00","close":"18:00"}]}'::jsonb),
  ('hotel',  '{"0":[{"open":"06:00","close":"22:00"}],"1":[{"open":"06:00","close":"22:00"}],"2":[{"open":"06:00","close":"22:00"}],"3":[{"open":"06:00","close":"22:00"}],"4":[{"open":"06:00","close":"22:00"}],"5":[{"open":"06:00","close":"22:00"}],"6":[{"open":"06:00","close":"22:00"}]}'::jsonb),
  ('spa',    '{"0":[{"open":"09:00","close":"21:00"}],"1":[{"open":"09:00","close":"21:00"}],"2":[{"open":"09:00","close":"21:00"}],"3":[{"open":"09:00","close":"21:00"}],"4":[{"open":"09:00","close":"21:00"}],"5":[{"open":"09:00","close":"21:00"}],"6":[{"open":"09:00","close":"21:00"}]}'::jsonb),
  ('golf',   '{"0":[{"open":"06:30","close":"18:30"}],"1":[{"open":"06:30","close":"18:30"}],"2":[{"open":"06:30","close":"18:30"}],"3":[{"open":"06:30","close":"18:30"}],"4":[{"open":"06:30","close":"18:30"}],"5":[{"open":"06:30","close":"18:30"}],"6":[{"open":"06:30","close":"18:30"}]}'::jsonb),
  ('nights', '{"0":[],"1":[],"2":[],"3":[],"4":[{"open":"22:00","close":"04:00"}],"5":[{"open":"22:00","close":"04:00"}],"6":[{"open":"22:00","close":"04:00"}]}'::jsonb)
)
INSERT INTO venues (id, partner_id, name, area, city, category, tier, opening_hours, is_test)
SELECT v.id::uuid, v.partner_id::uuid, v.name, v.area, 'lagos', v.category::venue_category, v.tier::venue_tier, h.hours, true
FROM (VALUES
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'TEST Oniru Beach Club', 'Oniru', 'beach_club', 'standard', 'beach1'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000101', 'TEST Lekki Sands Resort', 'Lekki', 'beach_club', 'standard', 'beach2'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000102', 'TEST Victoria Island Hotel Pool and Gym', 'Victoria Island', 'hotel', 'standard', 'hotel'),
  ('00000000-0000-4000-8000-000000000204', '00000000-0000-4000-8000-000000000102', 'TEST Ikoyi Spa', 'Ikoyi', 'spa', 'top', 'spa'),
  ('00000000-0000-4000-8000-000000000205', '00000000-0000-4000-8000-000000000103', 'TEST Lagoon Golf Course', 'Ikoyi', 'golf', 'standard', 'golf'),
  ('00000000-0000-4000-8000-000000000206', '00000000-0000-4000-8000-000000000104', 'TEST Afterdark Nightclub', 'Victoria Island', 'nightclub', 'standard', 'nights'),
  ('00000000-0000-4000-8000-000000000207', '00000000-0000-4000-8000-000000000104', 'TEST Waterfront Members Club', 'Ikoyi', 'members_club', 'top', 'nights')
) AS v(id, partner_id, name, area, category, tier, hours_name)
JOIN h ON h.name = v.hours_name
ON CONFLICT DO NOTHING;

-- Rates are TEST placeholders in kobo until partners quote; retail is cost plus half.
INSERT INTO offers (id, venue_id, category_id, rate_minor, retail_minor, rate_currency, daily_cap, prices_are_placeholders, is_test)
SELECT o.id::uuid, o.venue_id::uuid, c.id, o.rate, o.rate * 3 / 2, 'NGN', o.cap, true, true
FROM (VALUES
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000201', 'C03-S01-T01', 1800000, 30),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000202', 'C03-S01-T01', 1800000, 30),
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000203', 'C04-S01-T02', 2500000, 15),
  ('00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000204', 'C04-S05-T01', 6000000, 5),
  ('00000000-0000-4000-8000-000000000505', '00000000-0000-4000-8000-000000000205', 'C04-S08-T01', 4000000, 8),
  ('00000000-0000-4000-8000-000000000506', '00000000-0000-4000-8000-000000000206', 'C06-S01-T03', 0, 40),
  ('00000000-0000-4000-8000-000000000507', '00000000-0000-4000-8000-000000000207', 'C06-S04-T01', 2500000, 10)
) AS o(id, venue_id, code, rate, cap)
JOIN categories c ON c.code = o.code
ON CONFLICT DO NOTHING;

-- December Pass tiers from the one-page concept (proposed prices).
INSERT INTO plans (id, code, name, season_starts_on, season_ends_on, on_sale_from, on_sale_to, group_size, is_test) VALUES
  ('00000000-0000-4000-8000-000000000401', 'TEST-DEC26-ESSENTIAL', 'TEST December Pass Essential', '2026-12-01', '2027-01-10', '2026-11-15', '2027-01-05', 1, true),
  ('00000000-0000-4000-8000-000000000402', 'TEST-DEC26-PLUS', 'TEST December Pass Plus', '2026-12-01', '2027-01-10', '2026-11-15', '2027-01-05', 1, true),
  ('00000000-0000-4000-8000-000000000403', 'TEST-DEC26-CREW', 'TEST December Pass Crew', '2026-12-01', '2027-01-10', '2026-11-15', '2027-01-05', 4, true)
ON CONFLICT DO NOTHING;

INSERT INTO plan_prices (plan_id, currency, amount_minor) VALUES
  ('00000000-0000-4000-8000-000000000401', 'GBP', 14900), ('00000000-0000-4000-8000-000000000401', 'USD', 18900),
  ('00000000-0000-4000-8000-000000000402', 'GBP', 29900), ('00000000-0000-4000-8000-000000000402', 'USD', 37900),
  ('00000000-0000-4000-8000-000000000403', 'GBP', 89900), ('00000000-0000-4000-8000-000000000403', 'USD', 113900)
ON CONFLICT DO NOTHING;

INSERT INTO benefits (plan_id, category_id, quantity, period, shared_by_group, allowed_venue_tiers)
SELECT b.plan_id::uuid, c.id, b.quantity, 'per_pass', b.shared, '{standard,top}'
FROM (VALUES
  ('00000000-0000-4000-8000-000000000401', 'C01-S01-T01', 1, false),
  ('00000000-0000-4000-8000-000000000401', 'C03-S01', 2, false),
  ('00000000-0000-4000-8000-000000000401', 'C04-S01-T02', 2, false),
  ('00000000-0000-4000-8000-000000000401', 'C06-S01-T03', NULL, false),
  ('00000000-0000-4000-8000-000000000401', 'C02-S01-T01', NULL, false),
  ('00000000-0000-4000-8000-000000000402', 'C01-S01-T01', 1, false),
  ('00000000-0000-4000-8000-000000000402', 'C03-S01', 4, false),
  ('00000000-0000-4000-8000-000000000402', 'C04-S01-T02', 4, false),
  ('00000000-0000-4000-8000-000000000402', 'C04-S08', 1, false),
  ('00000000-0000-4000-8000-000000000402', 'C04-S05', 1, false),
  ('00000000-0000-4000-8000-000000000402', 'C06-S04-T01', 1, false),
  ('00000000-0000-4000-8000-000000000402', 'C01-S01-T03', 1, false),
  ('00000000-0000-4000-8000-000000000402', 'C06-S01-T03', NULL, false),
  ('00000000-0000-4000-8000-000000000402', 'C02-S01-T01', NULL, false),
  ('00000000-0000-4000-8000-000000000403', 'C01-S01-T01', 1, true),
  ('00000000-0000-4000-8000-000000000403', 'C03-S01', 4, false),
  ('00000000-0000-4000-8000-000000000403', 'C04-S01-T02', 4, false),
  ('00000000-0000-4000-8000-000000000403', 'C04-S08', 1, false),
  ('00000000-0000-4000-8000-000000000403', 'C04-S05', 1, false),
  ('00000000-0000-4000-8000-000000000403', 'C06-S04-T01', 1, true),
  ('00000000-0000-4000-8000-000000000403', 'C01-S01-T03', 1, false),
  ('00000000-0000-4000-8000-000000000403', 'C06-S01-T03', NULL, false),
  ('00000000-0000-4000-8000-000000000403', 'C02-S01-T01', NULL, false)
) AS b(plan_id, code, quantity, shared)
JOIN categories c ON c.code = b.code
ON CONFLICT DO NOTHING;

INSERT INTO members (id, full_name, phone, email, country, consent_terms_at, is_test)
SELECT m.id::uuid, m.full_name, m.phone, 'member+' || right(m.id, 3) || '@example.com', m.country, '2026-11-01T00:00:00Z', true
FROM (VALUES
  ('00000000-0000-4000-8000-000000000301', 'TEST Ada London', '+447700900001', 'GB'),
  ('00000000-0000-4000-8000-000000000302', 'TEST Tunde Manchester', '+447700900002', 'GB'),
  ('00000000-0000-4000-8000-000000000303', 'TEST Chioma Houston', '+12025550101', 'US'),
  ('00000000-0000-4000-8000-000000000304', 'TEST Emeka Atlanta', '+12025550102', 'US'),
  ('00000000-0000-4000-8000-000000000305', 'TEST Ngozi Crew Lead', '+447700900003', 'GB'),
  ('00000000-0000-4000-8000-000000000306', 'TEST Kemi Crew', '+447700900004', 'GB'),
  ('00000000-0000-4000-8000-000000000307', 'TEST Bayo Crew', '+447700900005', 'GB'),
  ('00000000-0000-4000-8000-000000000308', 'TEST Ife Crew', '+447700900006', 'GB')
) AS m(id, full_name, phone, country)
ON CONFLICT DO NOTHING;

INSERT INTO memberships (id, member_id, plan_id, starts_on, ends_on, status, group_id, pass_number)
SELECT ms.id::uuid, ms.member_id::uuid, ms.plan_id::uuid, '2026-12-01', '2027-01-10', 'active', ms.group_id::uuid, ms.pass
FROM (VALUES
  ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000402', NULL, 'TEST-0001'),
  ('00000000-0000-4000-8000-000000000702', '00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000401', NULL, 'TEST-0002'),
  ('00000000-0000-4000-8000-000000000703', '00000000-0000-4000-8000-000000000303', '00000000-0000-4000-8000-000000000402', NULL, 'TEST-0003'),
  ('00000000-0000-4000-8000-000000000704', '00000000-0000-4000-8000-000000000304', '00000000-0000-4000-8000-000000000401', NULL, 'TEST-0004'),
  ('00000000-0000-4000-8000-000000000705', '00000000-0000-4000-8000-000000000305', '00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000600', 'TEST-0005'),
  ('00000000-0000-4000-8000-000000000706', '00000000-0000-4000-8000-000000000306', '00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000600', 'TEST-0006'),
  ('00000000-0000-4000-8000-000000000707', '00000000-0000-4000-8000-000000000307', '00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000600', 'TEST-0007'),
  ('00000000-0000-4000-8000-000000000708', '00000000-0000-4000-8000-000000000308', '00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000600', 'TEST-0008')
) AS ms(id, member_id, plan_id, group_id, pass)
ON CONFLICT DO NOTHING;

-- Allowances, as grantAllowances() makes them for per-pass benefits: one per membership, or one per
-- Crew group for shared benefits. Each new allowance gets its audit row.
WITH granted AS (
  INSERT INTO allowances (benefit_id, membership_id, group_id, period_start, period_end, granted)
  SELECT DISTINCT ON (b.id, CASE WHEN b.shared_by_group AND ms.group_id IS NOT NULL THEN ms.group_id ELSE ms.id END)
    b.id,
    CASE WHEN b.shared_by_group AND ms.group_id IS NOT NULL THEN NULL ELSE ms.id END,
    CASE WHEN b.shared_by_group AND ms.group_id IS NOT NULL THEN ms.group_id ELSE NULL END,
    ms.starts_on, ms.ends_on, b.quantity
  FROM memberships ms
  JOIN benefits b ON b.plan_id = ms.plan_id AND b.period = 'per_pass'
  WHERE ms.pass_number LIKE 'TEST-%'
  ORDER BY b.id, CASE WHEN b.shared_by_group AND ms.group_id IS NOT NULL THEN ms.group_id ELSE ms.id END, ms.id
  ON CONFLICT DO NOTHING
  RETURNING *
)
INSERT INTO audit_log (actor_type, action, entity, entity_id, after)
SELECT 'system', 'allowance.granted', 'allowance', g.id, jsonb_build_object(
  'id', g.id, 'benefitId', g.benefit_id, 'membershipId', g.membership_id, 'groupId', g.group_id,
  'periodStart', g.period_start, 'periodEnd', g.period_end, 'granted', g.granted, 'used', g.used,
  'resetsAt', g.resets_at, 'createdAt', g.created_at, 'updatedAt', g.updated_at)
FROM granted g;

COMMIT;
