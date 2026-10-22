CREATE TYPE "public"."category_level" AS ENUM('category', 'subcategory', 'service');--> statement-breakpoint
CREATE TYPE "public"."offer_model" AS ENUM('included', 'included_or_add_on', 'add_on', 'member_privilege');--> statement-breakpoint
CREATE TYPE "public"."partner_priority" AS ENUM('P1', 'P2', 'P3');--> statement-breakpoint
CREATE TYPE "public"."partner_status" AS ENUM('to_identify', 'to_verify', 'prospect', 'personal_lead', 'negotiating', 'signed', 'live', 'paused', 'declined');--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"parent_id" uuid,
	"level" "category_level" NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"customer_visible" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categories_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "offers" ALTER COLUMN "benefit_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "benefits" ALTER COLUMN "type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "redemptions" ALTER COLUMN "benefit_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "retail_minor" integer;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "offer_model" "offer_model" DEFAULT 'included' NOT NULL;--> statement-breakpoint
ALTER TABLE "offers" ADD COLUMN "prices_are_placeholders" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "status" "partner_status" DEFAULT 'prospect' NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "priority" "partner_priority";--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "proposed_offer" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "offer_model" "offer_model";--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "proposed_cost_minor" integer;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "proposed_retail_minor" integer;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "prices_are_placeholders" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "next_action" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "benefits" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "redemptions" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "redemptions" ADD COLUMN "benefit_id" uuid;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_parent_id_index" ON "categories" USING btree ("parent_id");--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partners" ADD CONSTRAINT "partners_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benefits" ADD CONSTRAINT "benefits_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_benefit_id_benefits_id_fk" FOREIGN KEY ("benefit_id") REFERENCES "public"."benefits"("id") ON DELETE no action ON UPDATE no action;