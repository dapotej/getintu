-- Removes all TEST data, so sql/seed-test-data.sql (or pnpm db:seed) can load the current set.
-- Touches only rows marked is_test, the TEST- passes, and what hangs off them. The catalogue,
-- staff and exchange rates stay. Audit rows stay too: the audit log is append-only.
BEGIN;

CREATE TEMP TABLE test_members ON COMMIT DROP AS SELECT id FROM members WHERE is_test;
CREATE TEMP TABLE test_plans ON COMMIT DROP AS SELECT id FROM plans WHERE is_test;
-- Passes of TEST members, TEST pass numbers, and any pass on a TEST plan.
CREATE TEMP TABLE test_memberships ON COMMIT DROP AS
  SELECT id, group_id FROM memberships
  WHERE member_id IN (SELECT id FROM test_members) OR pass_number LIKE 'TEST-%' OR plan_id IN (SELECT id FROM test_plans);
CREATE TEMP TABLE test_partners ON COMMIT DROP AS SELECT id FROM partners WHERE is_test;
CREATE TEMP TABLE test_venues ON COMMIT DROP AS SELECT id FROM venues WHERE is_test OR partner_id IN (SELECT id FROM test_partners);
CREATE TEMP TABLE test_offers ON COMMIT DROP AS SELECT id FROM offers WHERE is_test OR venue_id IN (SELECT id FROM test_venues);
CREATE TEMP TABLE test_allowances ON COMMIT DROP AS
  SELECT id FROM allowances
  WHERE membership_id IN (SELECT id FROM test_memberships)
     OR group_id IN (SELECT group_id FROM test_memberships WHERE group_id IS NOT NULL)
     OR benefit_id IN (SELECT id FROM benefits WHERE plan_id IN (SELECT id FROM test_plans));

CREATE TEMP TABLE test_redemptions ON COMMIT DROP AS
  SELECT id FROM redemptions
  WHERE member_id IN (SELECT id FROM test_members)
     OR membership_id IN (SELECT id FROM test_memberships)
     OR venue_id IN (SELECT id FROM test_venues)
     OR offer_id IN (SELECT id FROM test_offers)
     OR allowance_id IN (SELECT id FROM test_allowances)
     OR benefit_id IN (SELECT id FROM benefits WHERE plan_id IN (SELECT id FROM test_plans));

DELETE FROM bookings
WHERE member_id IN (SELECT id FROM test_members)
   OR membership_id IN (SELECT id FROM test_memberships)
   OR venue_id IN (SELECT id FROM test_venues)
   OR allowance_id IN (SELECT id FROM test_allowances);
-- Any other booking that a TEST visit used just loses the link.
UPDATE bookings SET redemption_id = NULL WHERE redemption_id IN (SELECT id FROM test_redemptions);
DELETE FROM redemptions WHERE id IN (SELECT id FROM test_redemptions);
DELETE FROM esim_orders WHERE membership_id IN (SELECT id FROM test_memberships);
DELETE FROM devices WHERE member_id IN (SELECT id FROM test_members) OR member_id IN (SELECT member_id FROM memberships WHERE id IN (SELECT id FROM test_memberships));
DELETE FROM pass_codes WHERE membership_id IN (SELECT id FROM test_memberships);
-- Cars of TEST listings; anything else that pointed at one (or at a TEST driver) loses the link.
UPDATE bookings SET vehicle_id = NULL WHERE vehicle_id IN (SELECT id FROM vehicles WHERE venue_id IN (SELECT id FROM test_venues));
UPDATE redemptions SET vehicle_id = NULL WHERE vehicle_id IN (SELECT id FROM vehicles WHERE venue_id IN (SELECT id FROM test_venues));
DELETE FROM vehicles WHERE venue_id IN (SELECT id FROM test_venues);
UPDATE bookings SET driver_id = NULL WHERE driver_id IN (SELECT staff_user_id FROM staff_user_venues WHERE venue_id IN (SELECT id FROM test_venues));
DELETE FROM staff_user_venues WHERE venue_id IN (SELECT id FROM test_venues);
-- Venue staff belong to their partner: TEST ones go with it, any others are unlinked.
DELETE FROM staff_users WHERE is_test AND partner_id IN (SELECT id FROM test_partners) AND id NOT IN (SELECT staff_user_id FROM staff_user_venues);
UPDATE staff_users SET partner_id = NULL WHERE partner_id IN (SELECT id FROM test_partners);
DELETE FROM settlements WHERE partner_id IN (SELECT id FROM test_partners);

-- Payments of TEST members, passes or plans: refunds, then orders, subscriptions and crew invites.
CREATE TEMP TABLE test_orders ON COMMIT DROP AS
  SELECT id FROM orders WHERE member_id IN (SELECT id FROM test_members) OR plan_id IN (SELECT id FROM test_plans) OR membership_id IN (SELECT id FROM test_memberships);
DELETE FROM refunds WHERE order_id IN (SELECT id FROM test_orders);
DELETE FROM orders WHERE id IN (SELECT id FROM test_orders);
DELETE FROM subscriptions WHERE member_id IN (SELECT id FROM test_members) OR plan_id IN (SELECT id FROM test_plans) OR current_membership_id IN (SELECT id FROM test_memberships);
DELETE FROM crew_invites WHERE membership_id IN (SELECT id FROM test_memberships) OR accepted_membership_id IN (SELECT id FROM test_memberships) OR invited_by_member_id IN (SELECT id FROM test_members);

-- TEST clients go with their passes and invoices; a real client's seat held by a TEST member opens again.
CREATE TEMP TABLE test_clients ON COMMIT DROP AS SELECT id FROM client_accounts WHERE is_test;
DELETE FROM client_seats WHERE client_account_id IN (SELECT id FROM test_clients);
UPDATE client_seats SET membership_id = NULL, customer_ref = NULL, assigned_at = NULL WHERE membership_id IN (SELECT id FROM test_memberships);
DELETE FROM client_invoices WHERE client_account_id IN (SELECT id FROM test_clients);
UPDATE memberships SET client_account_id = NULL WHERE client_account_id IN (SELECT id FROM test_clients);

DELETE FROM allowances WHERE id IN (SELECT id FROM test_allowances);
DELETE FROM memberships WHERE id IN (SELECT id FROM test_memberships);
DELETE FROM members WHERE id IN (SELECT id FROM test_members);

DELETE FROM benefits WHERE plan_id IN (SELECT id FROM test_plans);
DELETE FROM plan_prices WHERE plan_id IN (SELECT id FROM test_plans);
DELETE FROM plans WHERE id IN (SELECT id FROM test_plans);

DELETE FROM offers WHERE id IN (SELECT id FROM test_offers);
DELETE FROM venues WHERE id IN (SELECT id FROM test_venues);
DELETE FROM partners WHERE id IN (SELECT id FROM test_partners);
DELETE FROM client_accounts WHERE id IN (SELECT id FROM test_clients);

COMMIT;
