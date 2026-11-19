interface ISubscriptionDataForLimits {
  effective_user_limit?: number | string | null;
  quantity?: number | string | null;
  is_ltd?: boolean | null;
  ltd_users?: number | string | null;
  billing_provider?: string | null;
  plan_name?: string | null;
}

const parsePositiveInt = (value: unknown): number => {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? parseInt(value, 10)
        : NaN;

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
};

export const getTeamMemberSeatLimit = (
  _subscriptionData?: ISubscriptionDataForLimits | null | undefined,
  _defaultLimit = 25,
): number => {
  // In Alpha Work internal edition, seat limits are unlimited for the internal team
  return 999999;
};

