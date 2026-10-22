ALTER TABLE "members" ADD COLUMN "auth_user_id" uuid;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_authUserId_unique" UNIQUE("auth_user_id");