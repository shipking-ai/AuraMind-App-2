/**
 * Onboarding completion check shared by the auth entry points.
 *
 * A brand-new account must pick a role and a topic before the paywall; a
 * returning account that already did this goes straight to the dashboard.
 * The flag lives in user_metadata (display-only) — authorization never
 * reads it, matching the `onboarding_completed` semantics used elsewhere.
 *
 * Legacy accounts signed up through the old "I am a…" signup picker, which
 * stored a role in user_metadata without setting onboarding_completed.
 * Treat those as onboarded so they don't get re-routed through the new flow
 * — the persona they chose already exists, and forcing it again would be a
 * regression against existing accounts.
 *
 * Internal accounts (admin / tester / employee / ceo / owner) also skip the
 * consumer onboarding: they are created and managed by staff through the
 * admin panel, not self-serve signups, and the persona picker would only
 * mislabel them. Plain `user` is NOT in this list — that is the default
 * role every new signup gets, and those accounts must still see onboarding.
 */

const ONBOARDING_ROLE_VALUES = [
  "learner",
  "student",
  "teacher",
  "doctor",
  "professional",
  "researcher",
];

/** Internal roles that bypass the consumer onboarding flow. */
const INTERNAL_ROLE_VALUES = ["owner", "ceo", "admin", "employee", "tester"];

export function hasCompletedOnboarding(
  user_metadata: Record<string, unknown> | undefined | null,
): boolean {
  if (!user_metadata) return false;
  if (user_metadata.onboarding_completed === true) return true;
  const existingRole = user_metadata.role;
  if (typeof existingRole !== "string") return false;
  return (
    (ONBOARDING_ROLE_VALUES as string[]).includes(existingRole) ||
    (INTERNAL_ROLE_VALUES as string[]).includes(existingRole)
  );
}