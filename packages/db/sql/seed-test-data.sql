-- TEST seed data as plain SQL, for databases this repo can't reach with a connection string
-- (e.g. Supabase staging through the dashboard or connector). Mirrors src/seed-data.ts and
-- grantAllowances() for per-pass benefits. Every name starts with TEST; phones are fiction-reserved.
-- Needs migrations 0000-0020: the catalogue (categories) comes from migration 0009.
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
INSERT INTO venues (id, partner_id, name, kind, area, city, category_id, login_code, tier, opening_hours, latitude, longitude, is_test)
SELECT v.id::uuid, v.partner_id::uuid, v.name, v.kind::venue_kind, v.area, 'lagos', c.id, v.login_code, v.tier::venue_tier, v.hours::jsonb, v.lat::double precision, v.lng::double precision, true
FROM (VALUES
  ('00000000-0000-4000-8000-000000001201', '00000000-0000-4000-8000-000000001101', 'TEST SkyPort Arrivals Desk', 'place', 'Ikeja', 'C01-S01', 'SKYARR', 'standard', '{"0":[{"open":"00:00","close":"24:00"}],"1":[{"open":"00:00","close":"24:00"}],"2":[{"open":"00:00","close":"24:00"}],"3":[{"open":"00:00","close":"24:00"}],"4":[{"open":"00:00","close":"24:00"}],"5":[{"open":"00:00","close":"24:00"}],"6":[{"open":"00:00","close":"24:00"}]}', 6.577, 3.3215),
  ('00000000-0000-4000-8000-000000001202', '00000000-0000-4000-8000-000000001102', 'TEST SkyPort Departure Lounge', 'place', 'Ikeja', 'C01-S01', 'SKYLNG', 'standard', '{"0":[{"open":"00:00","close":"24:00"}],"1":[{"open":"00:00","close":"24:00"}],"2":[{"open":"00:00","close":"24:00"}],"3":[{"open":"00:00","close":"24:00"}],"4":[{"open":"00:00","close":"24:00"}],"5":[{"open":"00:00","close":"24:00"}],"6":[{"open":"00:00","close":"24:00"}]}', 6.5795, 3.323),
  ('00000000-0000-4000-8000-000000001203', '00000000-0000-4000-8000-000000001103', 'TEST Coastal Rides chauffeurs', 'visiting', 'Lagos', 'C01-S02', 'COASTL', 'standard', '{"0":[{"open":"00:00","close":"24:00"}],"1":[{"open":"00:00","close":"24:00"}],"2":[{"open":"00:00","close":"24:00"}],"3":[{"open":"00:00","close":"24:00"}],"4":[{"open":"00:00","close":"24:00"}],"5":[{"open":"00:00","close":"24:00"}],"6":[{"open":"00:00","close":"24:00"}]}', NULL, NULL),
  ('00000000-0000-4000-8000-000000001204', '00000000-0000-4000-8000-000000001104', 'TEST Atlantic Shore Oniru', 'place', 'Oniru', 'C03-S01', 'ATLONI', 'standard', '{"0":[{"open":"10:00","close":"19:00"}],"1":[{"open":"10:00","close":"19:00"}],"2":[{"open":"10:00","close":"19:00"}],"3":[{"open":"10:00","close":"19:00"}],"4":[{"open":"10:00","close":"19:00"}],"5":[{"open":"10:00","close":"19:00"}],"6":[{"open":"10:00","close":"19:00"}]}', 6.4262, 3.4486),
  ('00000000-0000-4000-8000-000000001205', '00000000-0000-4000-8000-000000001104', 'TEST Atlantic Shore Lekki', 'place', 'Lekki', 'C03-S01', 'ATLLEK', 'standard', '{"0":[{"open":"09:00","close":"18:00"}],"1":[{"open":"09:00","close":"18:00"}],"2":[{"open":"09:00","close":"18:00"}],"3":[{"open":"09:00","close":"18:00"}],"4":[{"open":"09:00","close":"18:00"}],"5":[{"open":"09:00","close":"18:00"}],"6":[{"open":"09:00","close":"18:00"}]}', 6.432, 3.511),
  ('00000000-0000-4000-8000-000000001206', '00000000-0000-4000-8000-000000001105', 'TEST Marina Grand Hotel', 'place', 'Victoria Island', 'C04-S01', 'MARGRD', 'standard', '{"0":[{"open":"06:00","close":"22:00"}],"1":[{"open":"06:00","close":"22:00"}],"2":[{"open":"06:00","close":"22:00"}],"3":[{"open":"06:00","close":"22:00"}],"4":[{"open":"06:00","close":"22:00"}],"5":[{"open":"06:00","close":"22:00"}],"6":[{"open":"06:00","close":"22:00"}]}', 6.4287, 3.4219),
  ('00000000-0000-4000-8000-000000001207', '00000000-0000-4000-8000-000000001105', 'TEST Marina Suites Ikoyi', 'place', 'Ikoyi', 'C04-S01', 'MARSTE', 'standard', '{"0":[{"open":"06:00","close":"21:00"}],"1":[{"open":"06:00","close":"21:00"}],"2":[{"open":"06:00","close":"21:00"}],"3":[{"open":"06:00","close":"21:00"}],"4":[{"open":"06:00","close":"21:00"}],"5":[{"open":"06:00","close":"21:00"}],"6":[{"open":"06:00","close":"21:00"}]}', 6.452, 3.433),
  ('00000000-0000-4000-8000-000000001208', '00000000-0000-4000-8000-000000001106', 'TEST Lagoon Golf Club', 'place', 'Ikoyi', 'C04-S08', 'LAGOLF', 'standard', '{"0":[{"open":"06:30","close":"18:30"}],"1":[{"open":"06:30","close":"18:30"}],"2":[{"open":"06:30","close":"18:30"}],"3":[{"open":"06:30","close":"18:30"}],"4":[{"open":"06:30","close":"18:30"}],"5":[{"open":"06:30","close":"18:30"}],"6":[{"open":"06:30","close":"18:30"}]}', 6.4475, 3.444),
  ('00000000-0000-4000-8000-000000001209', '00000000-0000-4000-8000-000000001107', 'TEST Serenity Spa Ikoyi', 'place', 'Ikoyi', 'C04-S05', 'SERSPA', 'standard', '{"0":[{"open":"09:00","close":"21:00"}],"1":[{"open":"09:00","close":"21:00"}],"2":[{"open":"09:00","close":"21:00"}],"3":[{"open":"09:00","close":"21:00"}],"4":[{"open":"09:00","close":"21:00"}],"5":[{"open":"09:00","close":"21:00"}],"6":[{"open":"09:00","close":"21:00"}]}', 6.45, 3.438),
  ('00000000-0000-4000-8000-000000001210', '00000000-0000-4000-8000-000000001108', 'TEST Ikoyi House', 'place', 'Ikoyi', 'C06-S04', 'IKHOUS', 'top', '{"0":[],"1":[],"2":[],"3":[],"4":[{"open":"22:00","close":"04:00"}],"5":[{"open":"22:00","close":"04:00"}],"6":[{"open":"22:00","close":"04:00"}]}', 6.4545, 3.427),
  ('00000000-0000-4000-8000-000000001211', '00000000-0000-4000-8000-000000001109', 'TEST Afterdark Victoria Island', 'place', 'Victoria Island', 'C06-S01', 'AFTRVI', 'standard', '{"0":[],"1":[],"2":[],"3":[],"4":[{"open":"22:00","close":"04:00"}],"5":[{"open":"22:00","close":"04:00"}],"6":[{"open":"22:00","close":"04:00"}]}', 6.43, 3.425),
  ('00000000-0000-4000-8000-000000001212', '00000000-0000-4000-8000-000000001109', 'TEST Afterdark Lekki', 'place', 'Lekki', 'C06-S01', 'AFTRLK', 'standard', '{"0":[],"1":[],"2":[],"3":[],"4":[{"open":"22:00","close":"04:00"}],"5":[{"open":"22:00","close":"04:00"}],"6":[{"open":"22:00","close":"04:00"}]}', 6.439, 3.48),
  ('00000000-0000-4000-8000-000000001213', '00000000-0000-4000-8000-000000001110', 'TEST Marina Grill', 'place', 'Victoria Island', 'C02-S01', 'MARGRL', 'standard', '{"0":[{"open":"12:00","close":"23:00"}],"1":[{"open":"12:00","close":"23:00"}],"2":[{"open":"12:00","close":"23:00"}],"3":[{"open":"12:00","close":"23:00"}],"4":[{"open":"12:00","close":"23:00"}],"5":[{"open":"12:00","close":"23:00"}],"6":[{"open":"12:00","close":"23:00"}]}', 6.427, 3.418),
  ('00000000-0000-4000-8000-000000001214', '00000000-0000-4000-8000-000000001110', 'TEST Ikoyi Kitchen', 'place', 'Ikoyi', 'C02-S01', 'IKKTCH', 'standard', '{"0":[{"open":"12:00","close":"23:00"}],"1":[{"open":"12:00","close":"23:00"}],"2":[{"open":"12:00","close":"23:00"}],"3":[{"open":"12:00","close":"23:00"}],"4":[{"open":"12:00","close":"23:00"}],"5":[{"open":"12:00","close":"23:00"}],"6":[{"open":"12:00","close":"23:00"}]}', 6.451, 3.43)
) AS v(id, partner_id, name, kind, area, code, login_code, tier, hours, lat, lng)
JOIN categories c ON c.code = v.code
ON CONFLICT DO NOTHING;
-- Doctor on call: a service by phone (fictional number, country code 999), nothing to scan.
INSERT INTO venues (id, partner_id, name, kind, area, city, category_id, tier, opening_hours, service_phone, is_test)
SELECT '00000000-0000-4000-8000-000000001215', '00000000-0000-4000-8000-000000001111', 'TEST CareLine doctor line', 'remote', 'Lagos', 'lagos', c.id, 'standard',
  '{"0":[{"open":"00:00","close":"24:00"}],"1":[{"open":"00:00","close":"24:00"}],"2":[{"open":"00:00","close":"24:00"}],"3":[{"open":"00:00","close":"24:00"}],"4":[{"open":"00:00","close":"24:00"}],"5":[{"open":"00:00","close":"24:00"}],"6":[{"open":"00:00","close":"24:00"}]}'::jsonb,
  '+9990000000002', true
FROM categories c WHERE c.code = 'C08-S02'
ON CONFLICT DO NOTHING;

-- Door staff, one per venue, all with the TEST PIN 246810.
INSERT INTO staff_users (id, role, full_name, partner_id, pin_hash, is_test) VALUES
  ('00000000-0000-4000-8000-000000001301', 'door_staff', 'TEST Door SkyPort Arrivals Desk', '00000000-0000-4000-8000-000000001101', 'scrypt$7465737470696e73616c743030303030$862ff69b444925568d4da5f8707dac34d39145715071a6027eef74292e9ce4c9', true),
  ('00000000-0000-4000-8000-000000001302', 'door_staff', 'TEST Door SkyPort Departure Lounge', '00000000-0000-4000-8000-000000001102', 'scrypt$7465737470696e73616c743030303030$862ff69b444925568d4da5f8707dac34d39145715071a6027eef74292e9ce4c9', true),
  ('00000000-0000-4000-8000-000000001303', 'door_staff', 'TEST Door Coastal Rides chauffeurs', '00000000-0000-4000-8000-000000001103', 'scrypt$7465737470696e73616c743030303030$862ff69b444925568d4da5f8707dac34d39145715071a6027eef74292e9ce4c9', true),
  ('00000000-0000-4000-8000-000000001304', 'door_staff', 'TEST Door Atlantic Shore Oniru', '00000000-0000-4000-8000-000000001104', 'scrypt$7465737470696e73616c743030303030$862ff69b444925568d4da5f8707dac34d39145715071a6027eef74292e9ce4c9', true),
  ('00000000-0000-4000-8000-000000001305', 'door_staff', 'TEST Door Atlantic Shore Lekki', '00000000-0000-4000-8000-000000001104', 'scrypt$7465737470696e73616c743030303030$862ff69b444925568d4da5f8707dac34d39145715071a6027eef74292e9ce4c9', true),
  ('00000000-0000-4000-8000-000000001306', 'door_staff', 'TEST Door Marina Grand Hotel', '00000000-0000-4000-8000-000000001105', 'scrypt$7465737470696e73616c743030303030$862ff69b444925568d4da5f8707dac34d39145715071a6027eef74292e9ce4c9', true),
  ('00000000-0000-4000-8000-000000001307', 'door_staff', 'TEST Door Marina Suites Ikoyi', '00000000-0000-4000-8000-000000001105', 'scrypt$7465737470696e73616c743030303030$862ff69b444925568d4da5f8707dac34d39145715071a6027eef74292e9ce4c9', true),
  ('00000000-0000-4000-8000-000000001308', 'door_staff', 'TEST Door Lagoon Golf Club', '00000000-0000-4000-8000-000000001106', 'scrypt$7465737470696e73616c743030303030$862ff69b444925568d4da5f8707dac34d39145715071a6027eef74292e9ce4c9', true),
  ('00000000-0000-4000-8000-000000001309', 'door_staff', 'TEST Door Serenity Spa Ikoyi', '00000000-0000-4000-8000-000000001107', 'scrypt$7465737470696e73616c743030303030$862ff69b444925568d4da5f8707dac34d39145715071a6027eef74292e9ce4c9', true),
  ('00000000-0000-4000-8000-000000001310', 'door_staff', 'TEST Door Ikoyi House', '00000000-0000-4000-8000-000000001108', 'scrypt$7465737470696e73616c743030303030$862ff69b444925568d4da5f8707dac34d39145715071a6027eef74292e9ce4c9', true),
  ('00000000-0000-4000-8000-000000001311', 'door_staff', 'TEST Door Afterdark Victoria Island', '00000000-0000-4000-8000-000000001109', 'scrypt$7465737470696e73616c743030303030$862ff69b444925568d4da5f8707dac34d39145715071a6027eef74292e9ce4c9', true),
  ('00000000-0000-4000-8000-000000001312', 'door_staff', 'TEST Door Afterdark Lekki', '00000000-0000-4000-8000-000000001109', 'scrypt$7465737470696e73616c743030303030$862ff69b444925568d4da5f8707dac34d39145715071a6027eef74292e9ce4c9', true),
  ('00000000-0000-4000-8000-000000001313', 'door_staff', 'TEST Door Marina Grill', '00000000-0000-4000-8000-000000001110', 'scrypt$7465737470696e73616c743030303030$862ff69b444925568d4da5f8707dac34d39145715071a6027eef74292e9ce4c9', true),
  ('00000000-0000-4000-8000-000000001314', 'door_staff', 'TEST Door Ikoyi Kitchen', '00000000-0000-4000-8000-000000001110', 'scrypt$7465737470696e73616c743030303030$862ff69b444925568d4da5f8707dac34d39145715071a6027eef74292e9ce4c9', true)
ON CONFLICT DO NOTHING;

INSERT INTO staff_user_venues (staff_user_id, venue_id) VALUES
  ('00000000-0000-4000-8000-000000001301', '00000000-0000-4000-8000-000000001201'),
  ('00000000-0000-4000-8000-000000001302', '00000000-0000-4000-8000-000000001202'),
  ('00000000-0000-4000-8000-000000001303', '00000000-0000-4000-8000-000000001203'),
  ('00000000-0000-4000-8000-000000001304', '00000000-0000-4000-8000-000000001204'),
  ('00000000-0000-4000-8000-000000001305', '00000000-0000-4000-8000-000000001205'),
  ('00000000-0000-4000-8000-000000001306', '00000000-0000-4000-8000-000000001206'),
  ('00000000-0000-4000-8000-000000001307', '00000000-0000-4000-8000-000000001207'),
  ('00000000-0000-4000-8000-000000001308', '00000000-0000-4000-8000-000000001208'),
  ('00000000-0000-4000-8000-000000001309', '00000000-0000-4000-8000-000000001209'),
  ('00000000-0000-4000-8000-000000001310', '00000000-0000-4000-8000-000000001210'),
  ('00000000-0000-4000-8000-000000001311', '00000000-0000-4000-8000-000000001211'),
  ('00000000-0000-4000-8000-000000001312', '00000000-0000-4000-8000-000000001212'),
  ('00000000-0000-4000-8000-000000001313', '00000000-0000-4000-8000-000000001213'),
  ('00000000-0000-4000-8000-000000001314', '00000000-0000-4000-8000-000000001214')
ON CONFLICT DO NOTHING;

-- Coastal Rides' cars (fictional plates).
INSERT INTO vehicles (id, venue_id, plate, make_model, year, colour, is_test) VALUES
  ('00000000-0000-4000-8000-000000001601', '00000000-0000-4000-8000-000000001203', 'TST 101 AA', 'Toyota Land Cruiser', 2022, 'Black', true),
  ('00000000-0000-4000-8000-000000001602', '00000000-0000-4000-8000-000000001203', 'TST 102 AA', 'Lexus LX 600', 2023, 'White', true)
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
  ('00000000-0000-4000-8000-000000001517', '00000000-0000-4000-8000-000000001214', 'C02-S01-T01', 0, 10),
  ('00000000-0000-4000-8000-000000001518', '00000000-0000-4000-8000-000000001215', 'C08-S02-T01', 0, NULL),
  ('00000000-0000-4000-8000-000000001519', '00000000-0000-4000-8000-000000001205', 'C03-S01-T03', 6000000, 4),
  ('00000000-0000-4000-8000-000000001520', '00000000-0000-4000-8000-000000001211', 'C06-S01-T02', 15000000, 3)
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

-- A confirmed booking for a visiting service: TEST Ada's airport pickup on the day she lands.
INSERT INTO bookings (id, member_id, membership_id, venue_id, offer_id, booking_date, party_size, status, notes) VALUES
  ('00000000-0000-4000-8000-000000001601', '00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000001203', '00000000-0000-4000-8000-000000001504', '2026-12-14', 1, 'confirmed', 'TEST: flight BA75 lands 15:20')
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
