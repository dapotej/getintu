-- Removes all TEST data, so sql/seed-test-data.sql (or pnpm db:seed) can load the current set.
-- Touches only rows marked is_test, the TEST- passes, and what hangs off them. The catalogue,
-- staff and exchange rates stay. Audit rows stay too: the audit log is append-only.
BEGIN;

CREATE TEMP TABLE test_members ON COMMIT DROP AS SELECT id FROM members WHERE is_test;
CREATE TEMP TABLE test_memberships ON COMMIT DROP AS
  SELECT id, group_id FROM memberships WHERE member_id IN (SELECT id FROM test_members) OR pass_number LIKE 'TEST-%';
CREATE TEMP TABLE test_plans ON COMMIT DROP AS SELECT id FROM plans WHERE is_test;
CREATE TEMP TABLE test_partners ON COMMIT DROP AS SELECT id FROM partners WHERE is_test;
CREATE TEMP TABLE test_venues ON COMMIT DROP AS SELECT id FROM venues WHERE is_test OR partner_id IN (SELECT id FROM test_partners);
CREATE TEMP TABLE test_offers ON COMMIT DROP AS SELECT id FROM offers WHERE is_test OR venue_id IN (SELECT id FROM test_venues);

DELETE FROM redemptions
WHERE member_id IN (SELECT id FROM test_members)
   OR membership_id IN (SELECT id FROM test_memberships)
   OR venue_id IN (SELECT id FROM test_venues)
   OR offer_id IN (SELECT id FROM test_offers)
   OR benefit_id IN (SELECT id FROM benefits WHERE plan_id IN (SELECT id FROM test_plans));
DELETE FROM bookings
WHERE member_id IN (SELECT id FROM test_members)
   OR membership_id IN (SELECT id FROM test_memberships)
   OR venue_id IN (SELECT id FROM test_venues);
DELETE FROM esim_orders WHERE membership_id IN (SELECT id FROM test_memberships);
DELETE FROM devices WHERE member_id IN (SELECT id FROM test_members);
DELETE FROM staff_user_venues WHERE venue_id IN (SELECT id FROM test_venues);
UPDATE staff_users SET partner_id = NULL WHERE partner_id IN (SELECT id FROM test_partners);
DELETE FROM settlements WHERE partner_id IN (SELECT id FROM test_partners);

DELETE FROM allowances
WHERE membership_id IN (SELECT id FROM test_memberships)
   OR group_id IN (SELECT group_id FROM test_memberships WHERE group_id IS NOT NULL)
   OR benefit_id IN (SELECT id FROM benefits WHERE plan_id IN (SELECT id FROM test_plans));
DELETE FROM memberships WHERE id IN (SELECT id FROM test_memberships);
DELETE FROM members WHERE id IN (SELECT id FROM test_members);

DELETE FROM benefits WHERE plan_id IN (SELECT id FROM test_plans);
DELETE FROM plan_prices WHERE plan_id IN (SELECT id FROM test_plans);
DELETE FROM plans WHERE id IN (SELECT id FROM test_plans);

DELETE FROM offers WHERE id IN (SELECT id FROM test_offers);
DELETE FROM venues WHERE id IN (SELECT id FROM test_venues);
DELETE FROM partners WHERE id IN (SELECT id FROM test_partners);

COMMIT;
