CREATE TYPE "public"."benefit_cost_basis" AS ENUM('per_use', 'flat_per_member');--> statement-breakpoint
CREATE TABLE "fx_rates" (
	"currency" "currency" PRIMARY KEY NOT NULL,
	"kobo_per_unit" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "benefits" ADD COLUMN "cost_basis" "benefit_cost_basis" DEFAULT 'per_use' NOT NULL;--> statement-breakpoint
ALTER TABLE "benefits" ADD COLUMN "planned_cost_minor" integer;--> statement-breakpoint
ALTER TABLE "benefits" ADD COLUMN "expected_use_pct" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "overhead_per_member_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "benefits" ADD CONSTRAINT "benefits_expected_use_pct" CHECK ("benefits"."expected_use_pct" between 0 and 100);--> statement-breakpoint
ALTER TABLE "fx_rates" ENABLE ROW LEVEL SECURITY;