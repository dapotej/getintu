CREATE TYPE "public"."client_invoice_status" AS ENUM('issued', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."client_kind" AS ENUM('bank', 'employer', 'promoter');--> statement-breakpoint
CREATE TABLE "client_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" uuid NOT NULL,
	"number" text NOT NULL,
	"issued_on" date NOT NULL,
	"due_on" date,
	"amount_minor" integer NOT NULL,
	"currency" "currency" NOT NULL,
	"status" "client_invoice_status" DEFAULT 'issued' NOT NULL,
	"paid_on" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "client_invoices_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "client_seats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_account_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"membership_id" uuid,
	"customer_ref" text,
	"assigned_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "kind" "client_kind" DEFAULT 'bank' NOT NULL;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "contract_starts_on" date;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "contract_ends_on" date;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "contact_name" text;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "contact_email" text;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "contact_phone" text;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD COLUMN "is_test" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_seats" ADD CONSTRAINT "client_seats_client_account_id_client_accounts_id_fk" FOREIGN KEY ("client_account_id") REFERENCES "public"."client_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_seats" ADD CONSTRAINT "client_seats_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_seats" ADD CONSTRAINT "client_seats_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "client_invoices_client_account_id_index" ON "client_invoices" USING btree ("client_account_id");--> statement-breakpoint
CREATE INDEX "client_seats_client_account_id_index" ON "client_seats" USING btree ("client_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "client_seats_membership" ON "client_seats" USING btree ("membership_id") WHERE "client_seats"."membership_id" is not null;--> statement-breakpoint
ALTER TABLE "client_seats" ADD CONSTRAINT "client_seats_dates" CHECK ("ends_on" >= "starts_on");--> statement-breakpoint
ALTER TABLE "client_invoices" ADD CONSTRAINT "client_invoices_amount" CHECK ("amount_minor" >= 0);--> statement-breakpoint
-- Only the API reads these tables; Supabase's public API sees nothing.
ALTER TABLE "client_seats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "client_invoices" ENABLE ROW LEVEL SECURITY;
