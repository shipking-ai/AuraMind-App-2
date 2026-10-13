import { isOnline } from "../services/offline/offlineStudyService";

export type SubscriptionStatus = "active" | "trialing" | "canceled" | "past_due" | "none";

export const SUBSCRIPTION_STATUS_KEY = "bonamind.subscription.status.v1";

const VALID_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "trialing",
  "canceled",
  "past_due",
  "none",
]);

export function readStoredSubscriptionStatus(): SubscriptionStatus | null {
  try {
    const raw = window.localStorage.getItem(SUBSCRIPTION_STATUS_KEY);
    if (raw && VALID_STATUSES.has(raw)) return raw as SubscriptionStatus;
    return null;
  } catch {
    return null;
  }
}

export function storeSubscriptionStatus(status: string): void {
  try {
    window.localStorage.setItem(SUBSCRIPTION_STATUS_KEY, status);
  } catch {
    // Private browsing / quota — the in-memory status still works for this run.
  }
}

/**
 * Choose a subscription status when the network can't tell us.
 *
 * Offline, a signed-in user with cached decks must still be able to open the
 * app, so we replay the last status we actually observed. With no history we
 * grant a grace "active" while disconnected (the user demonstrably signed in
 * before) instead of locking them behind /subscribe the moment connectivity
 * dropped.
 */
export function subscriptionFallback(online = isOnline()): SubscriptionStatus {
  const stored = readStoredSubscriptionStatus();
  if (stored) return stored;
  return online ? "none" : "active";
}
