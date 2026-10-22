ALTER TABLE "venues" ALTER COLUMN "category_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "venues" DROP COLUMN "category";--> statement-breakpoint
DROP TYPE "public"."venue_category";