import { pgEnum } from "drizzle-orm/pg-core";
import { DECLINE_REASONS, MEMBERSHIP_STATUSES, VENUE_TIERS } from "@intu/rules";

// Enums the rules engine reasons about are defined once, in @intu/rules.
export const venueTierEnum = pgEnum("venue_tier", VENUE_TIERS);
// A place members go to, or a service that comes to them (chauffeur, home beauty), used by booking only.
// A place members visit; a service that comes to them (booked); or a service by phone or video.
export const venueKindEnum = pgEnum("venue_kind", ["place", "visiting", "remote"]);
// How members use a benefit: show the pass at the door, book a visiting service, request an
// airport service with flight details, call, ask the concierge, or in the app (eSIM).
export const usageModeEnum = pgEnum("usage_mode", ["door", "booking", "airport", "call", "concierge", "in_app"]);
export const membershipStatusEnum = pgEnum("membership_status", MEMBERSHIP_STATUSES);
export const declineReasonEnum = pgEnum("decline_reason", DECLINE_REASONS);

export const categoryLevelEnum = pgEnum("category_level", ["category", "subcategory", "service"]);
// How an offer reaches members. No credits (Dapo, 22 Oct 2026).
export const offerModelEnum = pgEnum("offer_model", ["included", "included_or_add_on", "add_on", "member_privilege"]);

export const currencyEnum = pgEnum("currency", ["GBP", "USD", "NGN"]);
export const cityEnum = pgEnum("city", ["lagos", "abuja"]);
// How a benefit is costed for plan margins: per use, or a flat fee per member.
export const benefitCostBasisEnum = pgEnum("benefit_cost_basis", ["per_use", "flat_per_member"]);
export const allowancePeriodEnum = pgEnum("allowance_period", ["per_pass", "per_month", "per_year"]);
export const clientKindEnum = pgEnum("client_kind", ["bank", "employer", "promoter"]);
export const clientInvoiceStatusEnum = pgEnum("client_invoice_status", ["issued", "paid", "void"]);
export const paymentSourceEnum = pgEnum("payment_source", ["direct", "client", "gift"]);
export const redemptionResultEnum = pgEnum("redemption_result", ["approved", "declined"]);
export const redemptionMethodEnum = pgEnum("redemption_method", ["online", "offline", "manual"]);
export const bookingStatusEnum = pgEnum("booking_status", ["requested", "confirmed", "declined", "cancelled", "completed", "no_show"]);
// draft → approved → paying (a transfer sent) → paid; a failed transfer can be sent again.
export const settlementStatusEnum = pgEnum("settlement_status", ["draft", "approved", "paying", "paid", "failed", "void"]);
export const staffRoleEnum = pgEnum("staff_role", [
  "door_staff",
  "venue_manager",
  "concierge",
  "ops",
  "ops_lead",
  "finance",
  "partnerships",
  "founder",
]);
export const esimInstallStatusEnum = pgEnum("esim_install_status", ["ordered", "ready", "installed", "failed", "refunded"]);
export const actorTypeEnum = pgEnum("actor_type", ["member", "staff", "system"]);

// Payments (milestone 6).
export const paymentProviderEnum = pgEnum("payment_provider", ["stripe", "paystack", "test"]);
export const orderKindEnum = pgEnum("order_kind", ["new", "renewal"]);
export const orderStatusEnum = pgEnum("order_status", ["pending", "paid", "failed", "expired", "refunded", "partially_refunded"]);
export const subscriptionStatusEnum = pgEnum("subscription_status", ["active", "past_due", "cancelled"]);
export const refundStatusEnum = pgEnum("refund_status", ["awaiting_approval", "rejected", "processing", "succeeded", "failed"]);
export const crewInviteStatusEnum = pgEnum("crew_invite_status", ["pending", "accepted", "cancelled"]);
