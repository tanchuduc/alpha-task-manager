import db from "../config/db";
import { log_error } from "./utils";

const DEFAULT_APPSUMO_POPUP_FREQUENCY_DAYS = 1;

export interface IAppSumoPopupClaim {
  should_show: boolean;
}

/**
 * How often (in days) the AppSumo promo popup may reappear for a user.
 * Backend-configurable via APPSUMO_POPUP_FREQUENCY_DAYS so it can be tuned without a frontend deploy.
 * Falls back to once per day when the variable is unset or not a positive integer.
 */
export function getAppSumoPopupFrequencyDays(): number {
  const parsed = parseInt(process.env.APPSUMO_POPUP_FREQUENCY_DAYS || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_APPSUMO_POPUP_FREQUENCY_DAYS;
}

/**
 * Atomically decides whether the AppSumo promo popup may be shown to this user and, if so,
 * records it in users.appsumo_popup_last_shown_at. The interval comes only from
 * APPSUMO_POPUP_FREQUENCY_DAYS, so logging out and back in never re-triggers the popup inside
 * that window (issue #2354). A single UPDATE keeps it race-free across tabs and devices.
 *
 * Returns null when the query fails (e.g. before the appsumo_popup_last_shown_at migration has
 * been applied). That is logged to the console only — no Slack alert, since this runs for every
 * eligible app load — and the client falls back to its local gate.
 */
export async function claimAppSumoPopupSlot(_userId: string | undefined): Promise<IAppSumoPopupClaim | null> {
  // In Alpha Work internal edition, AppSumo promo is completely disabled
  return { should_show: false };
}
