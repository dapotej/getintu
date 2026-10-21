CREATE TYPE "public"."actor_type" AS ENUM('member', 'staff', 'system');--> statement-breakpoint
CREATE TYPE "public"."allowance_period" AS ENUM('per_pass', 'per_month', 'per_year');--> statement-breakpoint
CREATE TYPE "public"."benefit_type" AS ENUM('beach_club', 'pool_gym', 'golf', 'spa', 'hosted_night', 'lounge', 'meet_assist', 'guest_list', 'priority_dining', 'partner_meal', 'club_visit', 'esim_data');--> statement-breakpoint
CREATE TYPE "public"."booking_status" AS ENUM('requested', 'confirmed', 'declined', 'cancelled', 'completed', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('GBP', 'USD', 'NGN');--> statement-breakpoint
CREATE TYPE "public"."decline_reason" AS ENUM('MEMBERSHIP_NOT_ACTIVE', 'OUTSIDE_MEMBERSHIP_DATES', 'VENUE_INACTIVE', 'VENUE_CLOSED', 'OFFER_NOT_VALID_NOW', 'BENEFIT_NOT_IN_PLAN', 'VENUE_TIER_NOT_ALLOWED', 'ALLOWANCE_USED_UP', 'VENUE_MONTHLY_CAP', 'VENUE_DAILY_LIMIT', 'OFFER_DAILY_CAP', 'DUPLICATE_SCAN');--> statement-breakpoint
CREATE TYPE "public"."esim_install_status" AS ENUM('ordered', 'ready', 'installed', 'failed', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('pending', 'active', 'suspended', 'ended', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_source" AS ENUM('direct', 'client', 'gift');--> statement-breakpoint
CREATE TYPE "public"."redemption_method" AS ENUM('online', 'offline', 'manual');--> statement-breakpoint
CREATE TYPE "public"."redemption_result" AS ENUM('approved', 'declined');--> statement-breakpoint
CREATE TYPE "public"."settlement_status" AS ENUM('draft', 'approved', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('door_staff', 'venue_manager', 'concierge', 'ops', 'ops_lead', 'finance', 'partnerships', 'founder');--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"benefit_type" "benefit_type" NOT NULL,
	"description" text,
	"rate_minor" integer NOT NULL,
	"rate_currency" "currency" DEFAULT 'NGN' NOT NULL,
	"valid_hours" jsonb,
	"valid_from" date,
	"valid_to" date,
	"daily_cap" integer,
	"active" boolean DEFAULT true NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "benefits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"type" "benefit_type" NOT NULL,
	"quantity" integer,
	"period" "allowance_period" NOT NULL,
	"shared_by_group" boolean DEFAULT false NOT NULL,
	"cap_once_per_venue_per_month" boolean DEFAULT false NOT NULL,
	"cap_once_per_venue_per_day" boolean DEFAULT true NOT NULL,
	"allowed_venue_tiers" "venue_tier"[] DEFAULT '{"standard"}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "benefits_planId_type_unique" UNIQUE("plan_id","type")
);
--> statement-breakpoint
CREATE TABLE "plan_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"currency" "currency" NOT NULL,
	"amount_minor" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_prices_planId_currency_unique" UNIQUE("plan_id","currency")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"season_starts_on" date,
	"season_ends_on" date,
	"duration_days" integer,
	"on_sale_from" date,
	"on_sale_to" date,
	"group_size" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "allowances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"benefit_id" uuid NOT NULL,
	"membership_id" uuid,
	"group_id" uuid,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"granted" integer,
	"used" integer DEFAULT 0 NOT NULL,
	"resets_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allowances_membership_period" UNIQUE("benefit_id","membership_id","period_start"),
	CONSTRAINT "allowances_group_period" UNIQUE("benefit_id","group_id","period_start"),
	CONSTRAINT "allowances_one_owner" CHECK (("allowances"."membership_id" is null) <> ("allowances"."group_id" is null)),
	CONSTRAINT "allowances_used_in_range" CHECK ("allowances"."used" >= 0 and ("allowances"."granted" is null or "allowances"."used" <= "allowances"."granted")),
	CONSTRAINT "allowances_period" CHECK ("allowances"."period_end" >= "allowances"."period_start")
);
--> statement-breakpoint
CREATE TABLE "client_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contract_ref" text,
	"seats" integer,
	"billing_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"public_key" text NOT NULL,
	"platform" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"status" "membership_status" DEFAULT 'pending' NOT NULL,
	"payment_source" "payment_source" DEFAULT 'direct' NOT NULL,
	"client_account_id" uuid,
	"group_id" uuid,
	"pass_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "memberships_passNumber_unique" UNIQUE("pass_number"),
	CONSTRAINT "memberships_dates" CHECK ("memberships"."ends_on" >= "memberships"."starts_on")
);
--> statement-breakpoint
CREATE TABLE "staff_user_venues" (
	"staff_user_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	CONSTRAINT "staff_user_venues_staff_user_id_venue_id_pk" PRIMARY KEY("staff_user_id","venue_id")
);
--> statement-breakpoint
CREATE TABLE "staff_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "staff_role" NOT NULL,
	"full_name" text NOT NULL,
	"email" text,
	"phone" text,
	"pin_hash" text,
	"totp_secret_encrypted" text,
	"partner_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"is_test" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "staff_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "esim_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"membership_id" uuid NOT NULL,
	"allowance_id" uuid,
	"provider" text DEFAULT 'airalo' NOT NULL,
	"provider_order_id" text,
	"plan_code" text NOT NULL,
	"data_mb" integer NOT NULL,
	"days" integer NOT NULL,
	"iccid" text,
	"install_status" "esim_install_status" DEFAULT 'ordered' NOT NULL,
	"activated_at" timestamp with time zone,
	"data_used_mb" integer,
	"cost_minor" integer,
	"cost_currency" "currency",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "esim_orders_providerOrderId_unique" UNIQUE("provider_order_id")
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_id" uuid NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"total_minor" integer NOT NULL,
	"currency" "currency" DEFAULT 'NGN' NOT NULL,
	"status" "settlement_status" DEFAULT 'draft' NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"payment_reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"event_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_events_eventId_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"member_id" uuid NOT NULL,
	"membership_id" uuid,
	"venue_id" uuid,
	"event_name" text,
	"booking_date" date NOT NULL,
	"party_size" integer DEFAULT 1 NOT NULL,
	"status" "booking_status" DEFAULT 'requested' NOT NULL,
	"allowance_id" uuid,
	"redemption_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"service_date" date NOT NULL,
	"member_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"offer_id" uuid NOT NULL,
	"benefit_type" "benefit_type" NOT NULL,
	"allowance_id" uuid,
	"staff_user_id" uuid,
	"result" "redemption_result" NOT NULL,
	"reason" "decline_reason",
	"method" "redemption_method" NOT NULL,
	"party_size" integer DEFAULT 1 NOT NULL,
	"scan_code" text,
	"flagged" boolean DEFAULT false NOT NULL,
	"flag_reason" text,
	"settlement_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"before" jsonb,
	"after" jsonb
);
--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "benefits" ADD CONSTRAINT "benefits_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_prices" ADD CONSTRAINT "plan_prices_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowances" ADD CONSTRAINT "allowances_benefit_id_benefits_id_fk" FOREIGN KEY ("benefit_id") REFERENCES "public"."benefits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allowances" ADD CONSTRAINT "allowances_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_user_venues" ADD CONSTRAINT "staff_user_venues_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_user_venues" ADD CONSTRAINT "staff_user_venues_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_users" ADD CONSTRAINT "staff_users_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esim_orders" ADD CONSTRAINT "esim_orders_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esim_orders" ADD CONSTRAINT "esim_orders_allowance_id_allowances_id_fk" FOREIGN KEY ("allowance_id") REFERENCES "public"."allowances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_partner_id_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."partners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_approved_by_staff_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_allowance_id_allowances_id_fk" FOREIGN KEY ("allowance_id") REFERENCES "public"."allowances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_redemption_id_redemptions_id_fk" FOREIGN KEY ("redemption_id") REFERENCES "public"."redemptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_allowance_id_allowances_id_fk" FOREIGN KEY ("allowance_id") REFERENCES "public"."allowances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_staff_user_id_staff_users_id_fk" FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redemptions" ADD CONSTRAINT "redemptions_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devices_member_id_index" ON "devices" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "memberships_member_id_index" ON "memberships" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "memberships_group_id_index" ON "memberships" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "bookings_member_id_index" ON "bookings" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "bookings_venue_id_booking_date_index" ON "bookings" USING btree ("venue_id","booking_date");--> statement-breakpoint
CREATE INDEX "redemptions_member_id_service_date_index" ON "redemptions" USING btree ("member_id","service_date");--> statement-breakpoint
CREATE INDEX "redemptions_offer_id_service_date_index" ON "redemptions" USING btree ("offer_id","service_date");--> statement-breakpoint
CREATE INDEX "redemptions_venue_id_occurred_at_index" ON "redemptions" USING btree ("venue_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "redemptions_scan_code_approved" ON "redemptions" USING btree ("scan_code") WHERE "redemptions"."result" = 'approved';--> statement-breakpoint
CREATE INDEX "audit_log_entity_entity_id_index" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_occurred_at_index" ON "audit_log" USING btree ("occurred_at");