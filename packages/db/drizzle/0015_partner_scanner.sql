CREATE TABLE "pass_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" uuid NOT NULL,
	"code" char(6) NOT NULL,
	"valid_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pass_codes_code_day" UNIQUE("code","valid_on"),
	CONSTRAINT "pass_codes_pass_day" UNIQUE("membership_id","valid_on")
);
--> statement-breakpoint
ALTER TABLE "venues" ADD COLUMN "login_code" text;--> statement-breakpoint
ALTER TABLE "redemptions" ADD COLUMN "flag_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "redemptions" ADD COLUMN "flag_reviewed_by_id" uuid;--> statement-breakpoint
ALTER TABLE "redemptions" ADD COLUMN "flag_review_note" text;--> statement-breakpoint
ALTER TABLE "pass_codes" ADD CONSTRAINT "pass_codes_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_flag_reviewed_by_id_staff_users_id_fk" FOREIGN KEY ("flag_reviewed_by_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_loginCode_unique" UNIQUE("login_code");--> statement-breakpoint
ALTER TABLE "pass_codes" ENABLE ROW LEVEL SECURITY;