ALTER TABLE "memberships" ADD COLUMN "arrives_on" date;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "departs_on" date;--> statement-breakpoint
ALTER TABLE "staff_users" ADD COLUMN "auth_user_id" uuid;--> statement-breakpoint
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_authUserId_unique" UNIQUE("auth_user_id");