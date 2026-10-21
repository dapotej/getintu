CREATE TYPE "public"."city" AS ENUM('lagos', 'abuja');--> statement-breakpoint
CREATE TYPE "public"."venue_category" AS ENUM('beach_club', 'hotel', 'golf', 'spa', 'gym', 'nightclub', 'members_club', 'restaurant', 'lounge');--> statement-breakpoint
CREATE TYPE "public"."venue_tier" AS ENUM('standard', 'top');--> statement-breakpoint
CREATE TABLE "members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"email" text,
	"photo_path" text,
	"country" char(2),
	"consent_terms_at" timestamp with time zone,
	"consent_marketing" boolean DEFAULT false NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "members_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "partners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text NOT NULL,
	"trading_name" text NOT NULL,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"bank_details_encrypted" text,
	"settlement_terms" text,
	"active" boolean DEFAULT true NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"area" text NOT NULL,
	"city" "city" NOT NULL,
	"category" "venue_category" NOT NULL,
	"tier" "venue_tier" DEFAULT 'standard' NOT NULL,
	"description" text,
	"opening_hours" jsonb NOT NULL,
	"capacity_notes" text,
	"photo_paths" text[] DEFAULT '{}' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;