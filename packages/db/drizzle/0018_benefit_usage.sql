CREATE TYPE "public"."usage_mode" AS ENUM('door', 'booking', 'airport', 'call', 'concierge', 'in_app');--> statement-breakpoint
ALTER TYPE "public"."venue_kind" ADD VALUE 'remote';--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "usage_mode" "usage_mode";--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "service_phone" text;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "trip" jsonb;--> statement-breakpoint
-- How members use each part of the catalogue. Entries left empty take their parent's; the top
-- level defaults to the door. Ops change these in the console.
UPDATE "categories" SET "usage_mode" = 'door' WHERE "level" = 'category';--> statement-breakpoint
UPDATE "categories" SET "usage_mode" = 'airport' WHERE "code" IN ('C01-S01', 'C01-S02');--> statement-breakpoint
UPDATE "categories" SET "usage_mode" = 'door' WHERE "code" = 'C01-S01-T03';--> statement-breakpoint
UPDATE "categories" SET "usage_mode" = 'booking' WHERE "code" IN ('C01-S03', 'C05-S02-T02', 'C05-S07', 'C08-S03');--> statement-breakpoint
UPDATE "categories" SET "usage_mode" = 'in_app' WHERE "code" = 'C01-S04';--> statement-breakpoint
UPDATE "categories" SET "usage_mode" = 'concierge' WHERE "code" IN ('C01-S05', 'C01-S06', 'C08');--> statement-breakpoint
UPDATE "categories" SET "usage_mode" = 'call' WHERE "code" = 'C08-S02';
