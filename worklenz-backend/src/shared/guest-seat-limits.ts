import { checkTeamSubscriptionStatus, getActiveGuestCount } from "../shared/paddle-utils";
import {
  FREE_GUEST_LIMIT,
  PRO_GUEST_LIMIT,
  APPSUMO_LTD_GUEST_LIMIT,
  BUSINESS_GUEST_LIMIT,
  SELF_HOSTED_GUEST_LIMIT
} from "./constants";
import { log_error } from "./utils";
import { isEnforceMode } from "./entitlements/gates";
import { resolveEntitlements } from "./entitlements/resolve-entitlements";

const APPSUMO_BUSINESS_UNLOCK_CODE_COUNT = 5;

export interface IGuestLimitInfo {
  plan_tier: string;
  guest_limit: number; // -1 = unlimited
  current_guest_count: number;
  remaining_slots: number;
  can_add_guest: boolean;
  error_message?: string;
}

/**
 * Pure guest-limit decision for a subscription-status row (checkTeamSubscriptionStatus) or a
 * session user. Exported so the entitlements shadow comparison runs the exact production logic.
 */
export function resolveLegacyGuestPlan(subscriptionData: any): { guestLimit: number; planTier: string } {
  let guestLimit = FREE_GUEST_LIMIT;
  let planTier = "FREE";

  if (subscriptionData?.subscription_type === "SELF_HOSTED") {
    guestLimit = SELF_HOSTED_GUEST_LIMIT;
    planTier = "SELF_HOSTED";
  } else if (
    subscriptionData?.subscription_type === "ANNUAL_BUSINESS" ||
    subscriptionData?.business_plan_override === true ||
    subscriptionData?.plan_name?.toLowerCase().includes("business")
  ) {
    guestLimit = BUSINESS_GUEST_LIMIT;
    planTier = "BUSINESS";
  } else if (
    subscriptionData?.subscription_type === "LIFE_TIME_DEAL" &&
    subscriptionData?.redeemed_codes_count >= APPSUMO_BUSINESS_UNLOCK_CODE_COUNT
  ) {
    // AppSumo LTD users with 5+ redeemed codes get Business plan features (unlimited guests)
    guestLimit = BUSINESS_GUEST_LIMIT; // -1 = unlimited
    planTier = "APPSUMO_BUSINESS";
  } else if (
    subscriptionData?.subscription_type === "LIFE_TIME_DEAL"
  ) {
    // AppSumo LTD users with 1-4 codes are treated as Pro: unlimited guests
    // Guests don't count towards seat limits
    guestLimit = APPSUMO_LTD_GUEST_LIMIT; // unlimited, same as Pro
    planTier = "APPSUMO_LTD";
  } else if (
    subscriptionData?.subscription_type === "PADDLE" &&
    // "Professional" (Classic) or "Pro (per user, ...)" (Paddle Billing)
    /^pro\b|professional/.test(String(subscriptionData?.plan_name ?? "").toLowerCase())
  ) {
    guestLimit = PRO_GUEST_LIMIT;
    planTier = "PROFESSIONAL";
  } else if (
    subscriptionData?.subscription_status === "trialing" ||
    subscriptionData?.subscription_type === "TRIAL"
  ) {
    guestLimit = FREE_GUEST_LIMIT;
    planTier = "TRIAL";
  } else {
    guestLimit = FREE_GUEST_LIMIT;
    planTier = "FREE";
  }

  return { guestLimit, planTier };
}

/**
 * Entitlements-based equivalent of resolveLegacyGuestPlan. Tier labels match the legacy ones so
 * error messages and getGuestLimitByTier keep working.
 */
export function resolveEntitlementGuestPlan(subscriptionData: any): { guestLimit: number; planTier: string } {
  const entitlements = resolveEntitlements(subscriptionData);
  let planTier: string;
  switch (entitlements.primarySource) {
    case "self_hosted":
      planTier = "SELF_HOSTED";
      break;
    case "appsumo_ltd":
      planTier = subscriptionData?.redeemed_codes_count >= APPSUMO_BUSINESS_UNLOCK_CODE_COUNT
        ? "APPSUMO_BUSINESS"
        : "APPSUMO_LTD";
      break;
    default:
      planTier = entitlements.tier === "pro" ? "PROFESSIONAL" : entitlements.tier.toUpperCase();
  }
  return { guestLimit: entitlements.guestLimit, planTier };
}

/**
 * Get guest seat limit information for a workspace
 * Determines the guest limit based on subscription tier and current guest count
 *
 * IMPORTANT: Guest members do NOT count towards regular team member seat limits.
 * This function only checks guest-specific limits based on plan tier.
 * 
 * Plan-based guest limits:
 * - FREE/TRIAL: 0 guests (no guest access)
 * - PROFESSIONAL: Unlimited guests
 * - APPSUMO_LTD (1-4 codes): Unlimited guests (Pro equivalent)
 * - APPSUMO_BUSINESS (5+ codes): Unlimited guests
 * - BUSINESS/SELF_HOSTED: Unlimited guests
 *
 * @param teamId - The team/workspace ID
 * @returns IGuestLimitInfo with limit info and current usage
 */
export async function getGuestSeatLimit(_teamId: string): Promise<IGuestLimitInfo> {
  // In Alpha Work internal edition, guest seats are unlimited
  return {
    plan_tier: "INTERNAL",
    guest_limit: -1,
    current_guest_count: 0,
    remaining_slots: -1,
    can_add_guest: true,
  };
}

/**
 * Verify that a guest can be added to a workspace
 * Returns false if the workspace has reached its guest limit
 *
 * @param teamId - The team/workspace ID
 * @returns boolean - True if a guest can be added, false otherwise
 */
export async function canAddGuest(_teamId: string): Promise<boolean> {
  return true;
}

/**
 * Get the guest limit for a specific plan tier
 * Useful for displaying limits in UI without querying subscription data
 *
 * @param planTier - The plan tier ('FREE', 'PROFESSIONAL', 'BUSINESS', etc.)
 * @returns number - The guest limit (-1 for unlimited, 0 for no guests)
 */
export function getGuestLimitByTier(planTier: string): number {
  switch (planTier.toUpperCase()) {
    case "PROFESSIONAL":
      return PRO_GUEST_LIMIT; // Unlimited
    case "BUSINESS":
      return BUSINESS_GUEST_LIMIT; // Unlimited
    case "ENTERPRISE":
      return BUSINESS_GUEST_LIMIT; // Unlimited
    case "SELF_HOSTED":
      return SELF_HOSTED_GUEST_LIMIT; // Unlimited
    case "APPSUMO_BUSINESS":
      return BUSINESS_GUEST_LIMIT; // Unlimited (5+ codes)
    case "APPSUMO_LTD":
      return APPSUMO_LTD_GUEST_LIMIT; // Unlimited (1-4 codes, Pro equivalent)
    case "FREE":
    case "TRIAL":
    default:
      return FREE_GUEST_LIMIT;
  }
}
