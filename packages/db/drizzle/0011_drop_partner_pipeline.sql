ALTER TABLE "partners" DROP CONSTRAINT "partners_category_id_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "partners" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "partners" DROP COLUMN "priority";--> statement-breakpoint
ALTER TABLE "partners" DROP COLUMN "category_id";--> statement-breakpoint
ALTER TABLE "partners" DROP COLUMN "proposed_offer";--> statement-breakpoint
ALTER TABLE "partners" DROP COLUMN "offer_model";--> statement-breakpoint
ALTER TABLE "partners" DROP COLUMN "proposed_cost_minor";--> statement-breakpoint
ALTER TABLE "partners" DROP COLUMN "proposed_retail_minor";--> statement-breakpoint
ALTER TABLE "partners" DROP COLUMN "prices_are_placeholders";--> statement-breakpoint
ALTER TABLE "partners" DROP COLUMN "next_action";--> statement-breakpoint
ALTER TABLE "partners" DROP COLUMN "notes";--> statement-breakpoint
DROP TYPE "public"."partner_priority";--> statement-breakpoint
DROP TYPE "public"."partner_status";