CREATE TYPE "public"."venue_kind" AS ENUM('place', 'visiting');--> statement-breakpoint
ALTER TYPE "public"."decline_reason" ADD VALUE 'BOOKING_REQUIRED';--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "kind" "venue_kind" DEFAULT 'place' NOT NULL;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "offer_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;