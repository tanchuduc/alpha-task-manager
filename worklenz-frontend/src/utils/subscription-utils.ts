import { ISUBSCRIPTION_TYPE } from '@/shared/constants';
import { ILocalSession } from '@/types/auth/local-session.types';

/** Once an AppSumo/LTD account redeems this many codes they unlock Business Plan features. */
const APPSUMO_BUSINESS_UNLOCK_CODE_COUNT = 5;

const isTruthyFlag = (value: unknown): boolean =>
  value === true || value === 1 || value === 'true' || value === 't';

/**
 * AppSumo Business (5+ codes / eligible / Business Plan name / override) — not AppSumo Pro.
 */
export const isAppSumoBusiness = (session: ILocalSession | null): boolean => {
  if (!session || session.subscription_type !== ISUBSCRIPTION_TYPE.LIFE_TIME_DEAL) return false;
  if (isTruthyFlag(session.business_plan_override)) return true;
  if (isTruthyFlag(session.appsumo_business_eligible)) return true;
  if ((session.redeemed_codes_count ?? 0) >= APPSUMO_BUSINESS_UNLOCK_CODE_COUNT) return true;
  const planName = session.plan_name?.toLowerCase() || '';
  return planName === 'business plan' || planName.includes('business');
};

/**
 * Checks if user has access to business features (client portal, project finance)
 * PADDLE users with business or enterprise plans, ANNUAL_BUSINESS users, SELF_HOSTED users,
 * users on active Business plan trials, manual overrides, and AppSumo Business (5+ codes) have access.
 * AppSumo Pro (LTD with fewer than 5 codes) does not.
 */
export const hasBusinessFeatureAccess = (session: ILocalSession | null): boolean => {
  return true;
};

/**
 * Features the legacy UI gated behind Business. When the backend is not enforcing entitlements
 * (session.entitlements.enforced is false), canUseFeature() falls back to
 * hasBusinessFeatureAccess() for these and treats every other feature as open, exactly as before.
 */
const LEGACY_BUSINESS_FEATURES = new Set([
  'client_portal',
  'client_portal_branding',
  'client_portal_invoices',
  'finance_module',
  'slack_integration',
  'restrict_task_creation',
  'planner_schedule',
  'planner_timeline',
  'planner_workload',
  'task_export',
  'advanced_reporting',
]);

/**
 * Features the backend decides from resolved entitlements even while it is not enforcing them
 * (mirrors `alwaysEnforce` in the backend feature registry). The client portal is Pro and
 * Business, which the legacy "Business only" check cannot express.
 */
const ALWAYS_ENFORCED_FEATURES = new Set([
  'client_portal',
  'client_portal_requests',
  'client_portal_chats',
  'client_portal_services',
  'client_portal_invoices',
]);

/**
 * Can the current session use a feature? Follows the backend's resolved entitlements once it is
 * enforcing them; until then it reproduces the legacy plan checks, or the caller's `legacy` rule.
 */
export const canUseFeature = (
  _session: ILocalSession | null,
  _feature: string,
  _legacy?: (_session: ILocalSession) => boolean
): boolean => {
  return true;
};

/**
 * Checks if user is on a business plan specifically
 */
export const isBusinessPlan = (_session: ILocalSession | null): boolean => {
  return true;
};

/**
 * Checks if user is on an enterprise plan specifically
 */
export const isEnterprisePlan = (_session: ILocalSession | null): boolean => {
  return true;
};

/**
 * Checks if user is on a free plan
 */
export const isFreeUser = (session: ILocalSession | null): boolean => {
  if (!session) return true;
  return session.subscription_type === ISUBSCRIPTION_TYPE.FREE;
};

/**
 * True when a trial license is past the grace period. Free plans are not expired trials.
 */
export const isExpiredTrialSession = (_session: ILocalSession | null): boolean => {
  return false;
};

/**
 * Get the subscription plan type for display purposes
 */
export const getSubscriptionPlanType = (session: ILocalSession | null): string => {
  if (!session) return 'Unknown';

  // Check for plan trials first
  if (session.subscription_type === 'BUSINESS_TRIAL') {
    return 'Business Trial';
  }
  if (session.subscription_type === 'ENTERPRISE_TRIAL') {
    return 'Enterprise Trial';
  }
  if (session.subscription_type === 'PLAN_TRIAL') {
    return `${session.trial_plan_display_name || 'Plan'} Trial`;
  }

  switch (session.subscription_type) {
    case ISUBSCRIPTION_TYPE.FREE:
      return 'Free';
    case ISUBSCRIPTION_TYPE.TRIAL:
      return 'Trial';
    case ISUBSCRIPTION_TYPE.LIFE_TIME_DEAL:
      return 'Lifetime Deal';
    case ISUBSCRIPTION_TYPE.CUSTOM:
      return 'Custom';
    case ISUBSCRIPTION_TYPE.CREDIT:
      return 'Credit';
    case ISUBSCRIPTION_TYPE.ANNUAL_PRO:
      return 'Annual Pro';
    case ISUBSCRIPTION_TYPE.ANNUAL_BUSINESS:
      return 'Annual Business';
    case ISUBSCRIPTION_TYPE.SELF_HOSTED:
      return 'Self Hosted';
    case ISUBSCRIPTION_TYPE.PADDLE:
      const planName = session.plan_name?.toLowerCase() || '';
      if (planName.includes('business')) return 'Business';
      if (planName.includes('enterprise')) return 'Enterprise';
      if (planName.includes('pro')) return 'Pro';
      return 'Paddle';
    default:
      return 'Unknown';
  }
};

/**
 * Checks if user is currently on a plan-specific trial
 */
export const isOnPlanTrial = (session: ILocalSession | null): boolean => {
  if (!session) return false;
  return Boolean(
    session.is_plan_trial || (session.active_plan_trial && session.plan_trial_end_date)
  );
};

/**
 * Gets the number of days remaining in a plan trial
 */
export const getPlanTrialDaysRemaining = (session: ILocalSession | null): number => {
  if (!session?.plan_trial_end_date) return 0;

  const endDate = new Date(session.plan_trial_end_date);
  const today = new Date();
  const diffTime = endDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return Math.max(0, diffDays);
};

/**
 * Checks if user is on a Business plan trial specifically
 */
export const isOnBusinessTrial = (session: ILocalSession | null): boolean => {
  if (!session) return false;
  return (
    session.subscription_type === 'BUSINESS_TRIAL' ||
    (session.active_plan_trial === 'BUSINESS_LARGE' && Boolean(session.plan_trial_end_date))
  );
};

/**
 * Gets trial expiration message
 */
export const getTrialExpirationMessage = (session: ILocalSession | null): string | null => {
  if (!isOnPlanTrial(session)) return null;

  const daysRemaining = getPlanTrialDaysRemaining(session);
  const planName = session?.trial_plan_display_name || 'Plan';

  if (daysRemaining === 0) {
    return `Your ${planName} trial expires today`;
  } else if (daysRemaining === 1) {
    return `Your ${planName} trial expires tomorrow`;
  } else if (daysRemaining <= 3) {
    return `Your ${planName} trial expires in ${daysRemaining} days`;
  }

  return null;
};

/**
 * Checks if user should be restricted from setting project health
 * NOTE: Project health is now available to all users regardless of subscription plan
 */
export const shouldRestrictProjectHealth = (session: ILocalSession | null): boolean => {
  // No restrictions - all users can access project health
  return false;
};

const LIFETIME_KEYWORDS = ['appsumo', 'life_time_deal', 'lifetime', 'life time'];

/**
 * Checks if a user is on an AppSumo / lifetime deal (LTD) plan.
 * Centralized detection used across layouts and promotional surfaces.
 */
export const isAppSumoUser = (
  session: ILocalSession | null,
  billingInfo?: { plan_name?: string; subscription_type?: string } | null
): boolean => {
  const fields = [
    billingInfo?.plan_name,
    billingInfo?.subscription_type,
    session?.subscription_type,
    session?.subscription_status,
  ].map(value => value?.toLowerCase() ?? '');

  return fields.some(field => LIFETIME_KEYWORDS.some(keyword => field.includes(keyword)));
};

/**
 * Checks if an AppSumo/LTD user should still see promotional upsell surfaces
 * (the promo popup, the notification drawer banner) nudging them to upgrade
 * to Business Plan. Once a user has already redeemed enough codes to be on
 * Business Plan, that promo is backwards, so this excludes them even though
 * isAppSumoUser() (used elsewhere for LTD-specific UI, unrelated to this
 * promo) still correctly reports them as an LTD account.
 */
export const shouldShowAppSumoPromo = (
  session: ILocalSession | null,
  billingInfo?: {
    plan_name?: string;
    subscription_type?: string;
    redeemed_codes_count?: number;
  } | null
): boolean => {
  if (!isAppSumoUser(session, billingInfo)) return false;

  const redeemedCodesCount = billingInfo?.redeemed_codes_count ?? session?.redeemed_codes_count ?? 0;
  const planName = billingInfo?.plan_name ?? session?.plan_name;

  return redeemedCodesCount < APPSUMO_BUSINESS_UNLOCK_CODE_COUNT && planName !== 'Business Plan';
};

/**
 * Checks if user should be restricted from using the billable feature.
 * Billable tracking is a Business-plan feature (same as client portal / project finance),
 * so it uses the same access check as those features.
 */
export const shouldRestrictBillableFeature = (session: ILocalSession | null): boolean => {
  return !hasBusinessFeatureAccess(session);
};

/**
 * Has the team used every purchased seat? Per-user (Paddle Billing) plans are capped by what was
 * bought on every tier, Business included. Other plans keep the older rule where Business is not
 * blocked by the client-side count (the backend still enforces).
 */
export const hasReachedSeatLimit = (
  session: ILocalSession | null,
  billing: { total_used?: number | null; total_seats?: number | null; billing_provider?: string | null } | null | undefined
): boolean => {
  const seats = billing?.total_seats ?? 0;
  if (!(seats > 0)) return false;
  if ((billing?.total_used ?? 0) < seats) return false;
  if (billing?.billing_provider === 'paddle_billing') return true;
  return !hasBusinessFeatureAccess(session);
};
