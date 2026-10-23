-- Entry is a scan at the door; packages are booked ahead for the concierge to arrange: a cabana,
-- a club table, a private chef. Only fills entries ops haven't set in the console.
UPDATE "categories" SET "usage_mode" = 'booking'
WHERE "usage_mode" IS NULL AND "code" IN (
  'C02-S01-T01', -- Preferred reservation
  'C02-S05',     -- Private Chefs
  'C03-S01-T03', -- Cabana/daybed
  'C03-S02-T01', -- Private beach house day
  'C03-S05',     -- Yacht Charters
  'C06-S01-T01', -- Club reservation
  'C06-S01-T02', -- Table booking
  'C06-S02-T01', -- Lounge reservation
  'C06-S07',     -- Nightlife Packages
  'C07-S02-T01'  -- Private cinema package
);
