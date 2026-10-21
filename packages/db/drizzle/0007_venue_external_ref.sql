ALTER TABLE "venues" ADD COLUMN "external_ref" text;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_externalRef_unique" UNIQUE("external_ref");