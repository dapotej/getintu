ALTER TABLE "benefits" DROP CONSTRAINT "benefits_planId_type_unique";--> statement-breakpoint
ALTER TABLE "offers" ALTER COLUMN "category_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "benefits" ALTER COLUMN "category_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "redemptions" ALTER COLUMN "category_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" DROP COLUMN "benefit_type";--> statement-breakpoint
ALTER TABLE "benefits" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "redemptions" DROP COLUMN "benefit_type";--> statement-breakpoint
ALTER TABLE "benefits" ADD CONSTRAINT "benefits_planId_categoryId_unique" UNIQUE("plan_id","category_id");--> statement-breakpoint
DROP TYPE "public"."benefit_type";