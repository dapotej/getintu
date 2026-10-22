ALTER TABLE "venues" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- A venue's kind comes from the catalogue: the subcategory of its first offer, otherwise the
-- nearest match for the old fixed list.
UPDATE "venues" v SET "category_id" = (
  SELECT p."id" FROM "offers" o
  JOIN "categories" s ON s."id" = o."category_id"
  JOIN "categories" p ON p."id" = s."parent_id"
  WHERE o."venue_id" = v."id"
  ORDER BY o."created_at", o."id"
  LIMIT 1
);--> statement-breakpoint
UPDATE "venues" v SET "category_id" = c."id"
FROM "categories" c
WHERE v."category_id" IS NULL AND c."code" = CASE v."category"
  WHEN 'beach_club' THEN 'C03-S01' WHEN 'hotel' THEN 'C04-S01' WHEN 'golf' THEN 'C04-S08'
  WHEN 'spa' THEN 'C04-S05' WHEN 'gym' THEN 'C04-S01' WHEN 'nightclub' THEN 'C06-S01'
  WHEN 'members_club' THEN 'C06-S04' WHEN 'restaurant' THEN 'C02-S01' WHEN 'lounge' THEN 'C06-S02' END;
