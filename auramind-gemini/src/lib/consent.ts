import { getAppPreference, setAppPreference } from "./appPreferences";

/** Marker recording whether the visitor has answered the consent banner. */
export const CONSENT_CHOICE_KEY = "auramind_consentChoice";
/** The analytics kill-switch, also toggled from both Settings screens. */
export const ANALYTICS_PREF_KEY = "auramind_usageAnalytics";

export type ConsentChoice = "accepted" | "declined";

/** The stored banner answer, or null when the visitor has never been asked. */
export function getConsentChoice(): ConsentChoice | null {
  return getAppPreference<ConsentChoice | null>(CONSENT_CHOICE_KEY, null);
}

/** True once the visitor has accepted or declined (banner stays hidden). */
export function hasConsentChoice(): boolean {
  return getConsentChoice() !== null;
}

/**
 * Persist a banner answer. The analytics preference flows through the same
 * key the Settings screens toggle, so the choice stays changeable there.
 */
export function recordConsentChoice(accepted: boolean): void {
  setAppPreference(ANALYTICS_PREF_KEY, accepted);
  setAppPreference<ConsentChoice>(CONSENT_CHOICE_KEY, accepted ? "accepted" : "declined");
}
