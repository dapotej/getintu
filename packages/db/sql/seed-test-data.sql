-- TEST seed data as plain SQL, for databases this repo can't reach with a connection string
-- (e.g. Supabase staging through the dashboard or connector). Mirrors src/seed-data.ts and
-- grantAllowances() for per-pass benefits. Every name starts with TEST; phones are fiction-reserved.
-- Needs migrations 0000-0014: the catalogue (categories) comes from migration 0009.
-- To replace older TEST data first, run sql/reset-test-data.sql.
-- Safe to run twice: existing rows are left alone.
BEGIN;

INSERT INTO partners (id, legal_name, trading_name, contact_email, settlement_terms, is_test) VALUES
  ('00000000-0000-4000-8000-000000001101', 'TEST SkyPort Protocol Ltd', 'TEST SkyPort Protocol', 'ops+101@example.com', 'TEST: monthly in arrears', true),
  ('00000000-0000-4000-8000-000000001102', 'TEST SkyPort Lounges Ltd', 'TEST SkyPort Lounges', 'ops+102@example.com', 'TEST: monthly in arrears', true),
  ('00000000-0000-4000-8000-000000001103', 'TEST Coastal Rides Ltd', 'TEST Coastal Rides', 'ops+103@example.com', 'TEST: monthly in arrears', true),
  ('00000000-0000-4000-8000-000000001104', 'TEST Atlantic Shore Leisure Ltd', 'TEST Atlantic Shore', 'ops+104@example.com', 'TEST: monthly in arrears', true),
  ('00000000-0000-4000-8000-000000001105', 'TEST Marina Hotels Ltd', 'TEST Marina Hotels', 'ops+105@example.com', 'TEST: monthly in arrears', true),
  ('00000000-0000-4000-8000-000000001106', 'TEST Lagoon Golf Club Ltd', 'TEST Lagoon Golf Club', 'ops+106@example.com', 'TEST: monthly in arrears', true),
  ('00000000-0000-4000-8000-000000001107', 'TEST Serenity Spa Ltd', 'TEST Serenity Spa', 'ops+107@example.com', 'TEST: monthly in arrears', true),
  ('00000000-0000-4000-8000-000000001108', 'TEST Ikoyi House Ltd', 'TEST Ikoyi House', 'ops+108@example.com', 'TEST: monthly in arrears', true),
  ('00000000-0000-4000-8000-000000001109', 'TEST Afterdark Nightlife Ltd', 'TEST Afterdark', 'ops+109@example.com', 'TEST: monthly in arrears', true),
  ('00000000-0000-4000-8000-000000001110', 'TEST Table Collective Ltd', 'TEST Table Collective', 'ops+110@example.com', 'TEST: monthly in arrears', true),
  ('00000000-0000-4000-8000-000000001111', 'TEST CareLine Health Ltd', 'TEST CareLine Health', 'ops+111@example.com', 'TEST: monthly in arrears', true)
ON CONFLICT DO NOTHING;

-- A venue's kind is a catalogue category or subcategory, by code.
INSERT INTO venues (id, partner_id, name, area, city, category_id, tier, opening_hours, is_test)
SELECT v.id::uuid, v.partner_id::uuid, v.name, v.area, 'lagos', c.id, v.tier::venue_tier, v.hours::jsonb, true
FROM (VALUES
  ('00000000-0000-4000-8000-000000001201', '00000000-0000-4000-8000-000000001101', 'TEST SkyPort Arrivals Desk', 'Ikeja', 'C01-S01', 'standard', '{"0":[{"open":"00:00","close":"24:00"}],"1":[{"open":"00:00","close":"24:00"}],"2":[{"open":"00:00","close":"24:00"}],"3":[{"open":"00:00","close":"24:00"}],"4":[{"open":"00:00","close":"24:00"}],"5":[{"open":"00:00","close":"24:00"}],"6":[{"open":"00:00","close":"24:00"}]}'),
  ('00000000-0000-4000-8000-000000001202', '00000000-0000-4000-8000-000000001102', 'TEST SkyPort Departure Lounge', 'Ikeja', 'C01-S01', 'standard', '{"0":[{"open":"00:00","close":"24:00"}],"1":[{"open":"00:00","close":"24:00"}],"2":[{"open":"00:00","close":"24:00"}],"3":[{"open":"00:00","close":"24:00"}],"4":[{"open":"00:00","close":"24:00"}],"5":[{"open":"00:00","close":"24:00"}],"6":[{"open":"00:00","close":"24:00"}]}'),
  ('00000000-0000-4000-8000-000000001203', '00000000-0000-4000-8000-000000001103', 'TEST Coastal Rides Airport Desk', 'Ikeja', 'C01-S02', 'standard', '{"0":[{"open":"00:00","close":"24:00"}],"1":[{"open":"00:00","close":"24:00"}],"2":[{"open":"00:00","close":"24:00"}],"3":[{"open":"00:00","close":"24:00"}],"4":[{"open":"00:00","close":"24:00"}],"5":[{"open":"00:00","close":"24:00"}],"6":[{"open":"00:00","close":"24:00"}]}'),
  ('00000000-0000-4000-8000-000000001204', '00000000-0000-4000-8000-000000001104', 'TEST Atlantic Shore Oniru', 'Oniru', 'C03-S01', 'standard', '{"0":[{"open":"10:00","close":"19:00"}],"1":[{"open":"10:00","close":"19:00"}],"2":[{"open":"10:00","close":"19:00"}],"3":[{"open":"10:00","close":"19:00"}],"4":[{"open":"10:00","close":"19:00"}],"5":[{"open":"10:00","close":"19:00"}],"6":[{"open":"10:00","close":"19:00"}]}'),
  ('00000000-0000-4000-8000-000000001205', '00000000-0000-4000-8000-000000001104', 'TEST Atlantic Shore Lekki', 'Lekki', 'C03-S01', 'standard', '{"0":[{"open":"09:00","close":"18:00"}],"1":[{"open":"09:00","close":"18:00"}],"2":[{"open":"09:00","close":"18:00"}],"3":[{"open":"09:00","close":"18:00"}],"4":[{"open":"09:00","close":"18:00"}],"5":[{"open":"09:00","close":"18:00"}],"6":[{"open":"09:00","close":"18:00"}]}'),
  ('00000000-0000-4000-8000-000000001206', '00000000-0000-4000-8000-000000001105', 'TEST Marina Grand Hotel', 'Victoria Island', 'C04-S01', 'standard', '{"0":[{"open":"06:00","close":"22:00"}],"1":[{"open":"06:00","close":"22:00"}],"2":[{"open":"06:00","close":"22:00"}],"3":[{"open":"06:00","close":"22:00"}],"4":[{"open":"06:00","close":"22:00"}],"5":[{"open":"06:00","close":"22:00"}],"6":[{"open":"06:00","close":"22:00"}]}'),
  ('00000000-0000-4000-8000-000000001207', '00000000-0000-4000-8000-000000001105', 'TEST Marina Suites Ikoyi', 'Ikoyi', 'C04-S01', 'standard', '{"0":[{"open":"06:00","close":"21:00"}],"1":[{"open":"06:00","close":"21:00"}],"2":[{"open":"06:00","close":"21:00"}],"3":[{"open":"06:00","close":"21:00"}],"4":[{"open":"06:00","close":"21:00"}],"5":[{"open":"06:00","close":"21:00"}],"6":[{"open":"06:00","close":"21:00"}]}'),
  ('00000000-0000-4000-8000-000000001208', '00000000-0000-4000-8000-000000001106', 'TEST Lagoon Golf Club', 'Ikoyi', 'C04-S08', 'standard', '{"0":[{"open":"06:30","close":"18:30"}],"1":[{"open":"06:30","close":"18:30"}],"2":[{"open":"06:30","close":"18:30"}],"3":[{"open":"06:30","close":"18:30"}],"4":[{"open":"06:30","close":"18:30"}],"5":[{"open":"06:30","close":"18:30"}],"6":[{"open":"06:30","close":"18:30"}]}'),
  ('00000000-0000-4000-8000-000000001209', '00000000-0000-4000-8000-000000001107', 'TEST Serenity Spa Ikoyi', 'Ikoyi', 'C04-S05', 'standard', '{"0":[{"open":"09:00","close":"21:00"}],"1":[{"open":"09:00","close":"21:00"}],"2":[{"open":"09:00","close":"21:00"}],"3":[{"open":"09:00","close":"21:00"}],"4":[{"open":"09:00","close":"21:00"}],"5":[{"open":"09:00","close":"21:00"}],"6":[{"open":"09:00","close":"21:00"}]}'),
  ('00000000-0000-4000-8000-000000001210', '00000000-0000-4000-8000-000000001108', 'TEST Ikoyi House', 'Ikoyi', 'C06-S04', 'top', '{"0":[],"1":[],"2":[],"3":[],"4":[{"open":"22:00","close":"04:00"}],"5":[{"open":"22:00","close":"04:00"}],"6":[{"open":"22:00","close":"04:00"}]}'),
  ('00000000-0000-4000-8000-000000001211', '00000000-0000-4000-8000-000000001109', 'TEST Afterdark Victoria Island', 'Victoria Island', 'C06-S01', 'standard', '{"0":[],"1":[],"2":[],"3":[],"4":[{"open":"22:00","close":"04:00"}],"5":[{"open":"22:00","close":"04:00"}],"6":[{"open":"22:00","close":"04:00"}]}'),
  ('00000000-0000-4000-8000-000000001212', '00000000-0000-4000-8000-000000001109', 'TEST Afterdark Lekki', 'Lekki', 'C06-S01', 'standard', '{"0":[],"1":[],"2":[],"3":[],"4":[{"open":"22:00","close":"04:00"}],"5":[{"open":"22:00","close":"04:00"}],"6":[{"open":"22:00","close":"04:00"}]}'),
  ('00000000-0000-4000-8000-000000001213', '00000000-0000-4000-8000-000000001110', 'TEST Marina Grill', 'Victoria Island', 'C02-S01', 'standard', '{"0":[{"open":"12:00","close":"23:00"}],"1":[{"open":"12:00","close":"23:00"}],"2":[{"open":"12:00","close":"23:00"}],"3":[{"open":"12:00","close":"23:00"}],"4":[{"open":"12:00","close":"23:00"}],"5":[{"open":"12:00","close":"23:00"}],"6":[{"open":"12:00","close":"23:00"}]}'),
  ('00000000-0000-4000-8000-000000001214', '00000000-0000-4000-8000-000000001110', 'TEST Ikoyi Kitchen', 'Ikoyi', 'C02-S01', 'standard', '{"0":[{"open":"12:00","close":"23:00"}],"1":[{"open":"12:00","close":"23:00"}],"2":[{"open":"12:00","close":"23:00"}],"3":[{"open":"12:00","close":"23:00"}],"4":[{"open":"12:00","close":"23:00"}],"5":[{"open":"12:00","close":"23:00"}],"6":[{"open":"12:00","close":"23:00"}]}')
) AS v(id, partner_id, name, area, code, tier, hours)
JOIN categories c ON c.code = v.code
ON CONFLICT DO NOTHING;

-- Costs per use in kobo: placeholders from the concept's wholesale estimates; retail is cost plus half.
INSERT INTO offers (id, venue_id, category_id, rate_minor, retail_minor, rate_currency, daily_cap, prices_are_placeholders, is_test)
SELECT o.id::uuid, o.venue_id::uuid, c.id, o.rate, o.rate * 3 / 2, 'NGN', o.cap, true, true
FROM (VALUES
  ('00000000-0000-4000-8000-000000001501', '00000000-0000-4000-8000-000000001201', 'C01-S01-T01', 6000000, 20),
  ('00000000-0000-4000-8000-000000001502', '00000000-0000-4000-8000-000000001201', 'C01-S01-T02', 4500000, 20),
  ('00000000-0000-4000-8000-000000001503', '00000000-0000-4000-8000-000000001202', 'C01-S01-T03', 3500000, 30),
  ('00000000-0000-4000-8000-000000001504', '00000000-0000-4000-8000-000000001203', 'C01-S02-T01', 4500000, 15),
  ('00000000-0000-4000-8000-000000001505', '00000000-0000-4000-8000-000000001203', 'C01-S02-T02', 4500000, 15),
  ('00000000-0000-4000-8000-000000001506', '00000000-0000-4000-8000-000000001204', 'C03-S01-T01', 1500000, 30),
  ('00000000-0000-4000-8000-000000001507', '00000000-0000-4000-8000-000000001205', 'C03-S01-T02', 2200000, 30),
  ('00000000-0000-4000-8000-000000001508', '00000000-0000-4000-8000-000000001206', 'C04-S01-T02', 2500000, 15),
  ('00000000-0000-4000-8000-000000001509', '00000000-0000-4000-8000-000000001207', 'C04-S01-T02', 2800000, 10),
  ('00000000-0000-4000-8000-000000001510', '00000000-0000-4000-8000-000000001208', 'C04-S08-T01', 4000000, 8),
  ('00000000-0000-4000-8000-000000001511', '00000000-0000-4000-8000-000000001209', 'C04-S05-T01', 6000000, 6),
  ('00000000-0000-4000-8000-000000001512', '00000000-0000-4000-8000-000000001209', 'C04-S05-T02', 4500000, 6),
  ('00000000-0000-4000-8000-000000001513', '00000000-0000-4000-8000-000000001210', 'C06-S04-T01', 2500000, 10),
  ('00000000-0000-4000-8000-000000001514', '00000000-0000-4000-8000-000000001211', 'C06-S01-T03', 0, 40),
  ('00000000-0000-4000-8000-000000001515', '00000000-0000-4000-8000-000000001212', 'C06-S01-T03', 0, 30),
  ('00000000-0000-4000-8000-000000001516', '00000000-0000-4000-8000-000000001213', 'C02-S01-T01', 0, 10),
  ('00000000-0000-4000-8000-000000001517', '00000000-0000-4000-8000-000000001214', 'C02-S01-T01', 0, 10)
) AS o(id, venue_id, code, rate, cap)
JOIN categories c ON c.code = o.code
ON CONFLICT DO NOTHING;

-- December Pass tiers from the one-page concept (proposed prices), with ₦42,000 fixed costs per member.
INSERT INTO plans (id, code, name, season_starts_on, season_ends_on, on_sale_from, on_sale_to, group_size, overhead_per_member_minor, is_test) VALUES
  ('00000000-0000-4000-8000-000000000401', 'TEST-DEC26-ESSENTIAL', 'TEST December Pass Essential', '2026-12-01', '2027-01-10', '2026-11-15', '2027-01-05', 1, 4200000, true),
  ('00000000-0000-4000-8000-000000000402', 'TEST-DEC26-PLUS', 'TEST December Pass Plus', '2026-12-01', '2027-01-10', '2026-11-15', '2027-01-05', 1, 4200000, true),
  ('00000000-0000-4000-8000-000000000403', 'TEST-DEC26-CREW', 'TEST December Pass Crew', '2026-12-01', '2027-01-10', '2026-11-15', '2027-01-05', 4, 4200000, true)
ON CONFLICT DO NOTHING;

INSERT INTO plan_prices (plan_id, currency, amount_minor) VALUES
  ('00000000-0000-4000-8000-000000000401', 'GBP', 14900),
  ('00000000-0000-4000-8000-000000000401', 'USD', 18900),
  ('00000000-0000-4000-8000-000000000402', 'GBP', 29900),
  ('00000000-0000-4000-8000-000000000402', 'USD', 37900),
  ('00000000-0000-4000-8000-000000000403', 'GBP', 89900),
  ('00000000-0000-4000-8000-000000000403', 'USD', 113900)
ON CONFLICT DO NOTHING;

-- Arrival services are always used; doctor on call is a flat fee per member.
INSERT INTO benefits (plan_id, category_id, quantity, period, shared_by_group, allowed_venue_tiers, cost_basis, planned_cost_minor, expected_use_pct)
SELECT b.plan_id::uuid, c.id, b.quantity, 'per_pass', b.shared, '{standard,top}', b.basis::benefit_cost_basis, b.planned, b.pct
FROM (VALUES
  ('00000000-0000-4000-8000-000000000401', 'C01-S01-T01', 1, false, 'per_use', NULL, 100),
  ('00000000-0000-4000-8000-000000000401', 'C03-S01', 2, false, 'per_use', NULL, 60),
  ('00000000-0000-4000-8000-000000000401', 'C04-S01-T02', 2, false, 'per_use', NULL, 60),
  ('00000000-0000-4000-8000-000000000401', 'C02-S01-T01', NULL::int, false, 'per_use', NULL, 60),
  ('00000000-0000-4000-8000-000000000401', 'C06-S01-T03', NULL::int, false, 'per_use', NULL, 60),
  ('00000000-0000-4000-8000-000000000401', 'C08-S02', NULL, false, 'flat_per_member', 900000, 60),
  ('00000000-0000-4000-8000-000000000402', 'C01-S01-T01', 1, false, 'per_use', NULL, 100),
  ('00000000-0000-4000-8000-000000000402', 'C01-S02-T01', 1, false, 'per_use', NULL, 100),
  ('00000000-0000-4000-8000-000000000402', 'C03-S01', 4, false, 'per_use', NULL, 60),
  ('00000000-0000-4000-8000-000000000402', 'C04-S01-T02', 4, false, 'per_use', NULL, 60),
  ('00000000-0000-4000-8000-000000000402', 'C04-S08', 1, false, 'per_use', NULL, 60),
  ('00000000-0000-4000-8000-000000000402', 'C04-S05', 1, false, 'per_use', NULL, 60),
  ('00000000-0000-4000-8000-000000000402', 'C02-S01-T01', NULL::int, false, 'per_use', NULL, 60),
  ('00000000-0000-4000-8000-000000000402', 'C06-S01-T03', NULL::int, false, 'per_use', NULL, 60),
  ('00000000-0000-4000-8000-000000000402', 'C06-S04-T01', 1, false, 'per_use', NULL, 60),
  ('00000000-0000-4000-8000-000000000402', 'C01-S01-T03', 1, false, 'per_use', NULL, 60),
  ('00000000-0000-4000-8000-000000000402', 'C08-S02', NULL, false, 'flat_per_member', 900000, 60),
  ('00000000-0000-4000-8000-000000000403', 'C01-S01-T01', 1, true, 'per_use', NULL, 100),
  ('00000000-0000-4000-8000-000000000403', 'C01-S02-T01', 1, true, 'per_use', NULL, 100),
  ('00000000-0000-4000-8000-000000000403', 'C03-S01', 4, false, 'per_use', NULL, 60),
  ('00000000-0000-4000-8000-000000000403', 'C04-S01-T02', 4, false, 'per_use', NULL, 60),
  ('00000000-0000-4000-8000-000000000403', 'C04-S08', 1, false, 'per_use', NULL, 60),
  ('00000000-0000-4000-8000-000000000403', 'C04-S05', 1, false, 'per_use', NULL, 60),
  ('00000000-0000-4000-8000-000000000403', 'C02-S01-T01', NULL::int, false, 'per_use', NULL, 60),
  ('00000000-0000-4000-8000-000000000403', 'C06-S01-T03', NULL::int, false, 'per_use', NULL, 60),
  ('00000000-0000-4000-8000-000000000403', 'C06-S04-T01', 1, true, 'per_use', NULL, 60),
  ('00000000-0000-4000-8000-000000000403', 'C01-S01-T03', 1, false, 'per_use', NULL, 60),
  ('00000000-0000-4000-8000-000000000403', 'C08-S02', NULL, false, 'flat_per_member', 900000, 60)
) AS b(plan_id, code, quantity, shared, basis, planned, pct)
JOIN categories c ON c.code = b.code
ON CONFLICT DO NOTHING;

INSERT INTO fx_rates (currency, kobo_per_unit) VALUES ('GBP', 177000), ('USD', 140000)
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
