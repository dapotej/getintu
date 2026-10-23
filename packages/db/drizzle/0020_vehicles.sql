CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"plate" text NOT NULL,
	"make_model" text NOT NULL,
	"year" integer,
	"colour" text,
	"active" boolean DEFAULT true NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "vehicle_id" uuid;--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "driver_id" uuid;--> statement-breakpoint
ALTER TABLE "redemptions" ADD COLUMN "vehicle_id" uuid;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_driver_id_staff_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Only the API reads this table; Supabase's public API sees nothing.
ALTER TABLE "vehicles" ENABLE ROW LEVEL SECURITY;
