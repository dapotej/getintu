ALTER TYPE "public"."settlement_status" ADD VALUE 'paying' BEFORE 'paid';--> statement-breakpoint
ALTER TYPE "public"."settlement_status" ADD VALUE 'failed' BEFORE 'void';--> statement-breakpoint
CREATE TABLE "settlement_adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_id" uuid NOT NULL,
	"amount_minor" integer NOT NULL,
	"reason" text NOT NULL,
	"created_by_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "payout_bank_name" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "payout_account_last4" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "payout_account_name" text;--> statement-breakpoint
ALTER TABLE "partners" ADD COLUMN "payout_recipient_code" text;--> statement-breakpoint
ALTER TABLE "staff_users" ADD COLUMN "can_approve_payouts" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "lines_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "line_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "changed_by_id" uuid;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "paid_by_id" uuid;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "transfer_reference" text;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "transfer_code" text;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "transfer_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "failure_reason" text;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "void_reason" text;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "redemptions" ADD COLUMN "settled_amount_minor" integer;--> statement-breakpoint
ALTER TABLE "redemptions" ADD COLUMN "settlement_hold_reason" text;--> statement-breakpoint
ALTER TABLE "settlement_adjustments" ADD CONSTRAINT "settlement_adjustments_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_adjustments" ADD CONSTRAINT "settlement_adjustments_created_by_id_staff_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_changed_by_id_staff_users_id_fk" FOREIGN KEY ("changed_by_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_paid_by_id_staff_users_id_fk" FOREIGN KEY ("paid_by_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "settlements_partner_period_live" ON "settlements" USING btree ("partner_id","period_start") WHERE "settlements"."status" <> 'void' and "settlements"."deleted_at" is null;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_transferReference_unique" UNIQUE("transfer_reference");--> statement-breakpoint
-- Founders approve payouts from the start; anyone else is switched on in the console.
UPDATE "staff_users" SET "can_approve_payouts" = true WHERE "role" = 'founder';
--> statement-breakpoint
-- Like every table: Supabase's public API must not reach it.
ALTER TABLE "settlement_adjustments" ENABLE ROW LEVEL SECURITY;
