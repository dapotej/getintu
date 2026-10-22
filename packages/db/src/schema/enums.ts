import { pgEnum } from "drizzle-orm/pg-core";
import { DECLINE_REASONS, MEMBERSHIP_STATUSES, VENUE_TIERS } from "@intu/rules";

// Enums the rules engine reasons about are defined once, in @intu/rules.
export const venueTierEnum = pgEnum("venue_tier", VENUE_TIERS);
export const membershipStatusEnum = pgEnum("membership_status", MEMBERSHIP_STATUSES);
export const declineReasonEnum = pgEnum("decline_reason", DECLINE_REASONS);

export const categoryLevelEnum = pgEnum("category_level", ["category", "subcategory", "service"]);
// How an offer reaches members. No credits (Dapo, 22 Oct 2026).
export const offerModelEnum = pgEnum("offer_model", ["included", "included_or_add_on", "add_on", "member_privilege"]);

export const currencyEnum = pgEnum("currency", ["GBP", "USD", "NGN"]);
export const cityEnum = pgEnum("city", ["lagos", "abuja"]);
export const venueCategoryEnum = pgEnum("venue_category", [
  "beach_club",
  "hotel",
  "golf",
  "spa",
  "gym",
  "nightclub",
  "members_club",
  "restaurant",
  "lounge",
]);
export const allowancePeriodEnum = pgEnum("allowance_period", ["per_pass", "per_month", "per_year"]);
export const paymentSourceEnum = pgEnum("payment_source", ["direct", "client", "gift"]);
export const redemptionResultEnum = pgEnum("redemption_result", ["approved", "declined"]);
export const redemptionMethodEnum = pgEnum("redemption_method", ["online", "offline", "manual"]);
export const bookingStatusEnum = pgEnum("booking_status", ["requested", "confirmed", "declined", "cancelled", "completed", "no_show"]);
export const settlementStatusEnum = pgEnum("settlement_status", ["draft", "approved", "paid", "void"]);
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
