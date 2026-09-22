/**
 * Entitlement: the single place that decides whether a user has paid access.
 *
 * WHY THIS EXISTS — this is a security boundary, not a convenience wrapper.
 *
 * Subscription status used to live in `user_metadata`, which Supabase lets a
 * signed-in user write directly:
 *
 *     await supabase.auth.updateUser({ data: { subscription_status: 'active' } })
 *
 * The Stripe webhook wrote it there and /api/subscription read it back, so the
 * server was treating a client-writable field as the source of truth for
 * billing. Any account could grant itself a permanent free subscription with
 * one line. CLAUDE.md already states the rule for admin roles — "never trust
 * user_metadata for authorization" — and billing needs the same treatment.
 *
 * `app_metadata` is only writable with the service-role key, which never
 * leaves the server. That makes it the correct home for the authorization
 * decision.
 *
 * DELIBERATELY NO FALLBACK to user_metadata. A fallback would reintroduce the
 * whole bug: an attacker sets user_metadata on an account that has no
 * app_metadata entry, the read falls through, and they are entitled again.
 * Existing users are backfilled by
 * supabase/migrations/20260907000020_move_entitlement_to_app_metadata.sql,
 * which must be applied BEFORE this code ships — after the backfill, an
 * absent app_metadata entry correctly means "never subscribed".
 *
 * Display-only fields (plan name, trial_end, payment_failure_count) stay in
 * user_metadata. Tampering with those changes what a user sees, not what they
 * can do, so they are not worth the migration risk.
 */

/** Statuses Stripe can report, plus our local terminal states. */
export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'expired'
  | 'none';

/** Statuses that grant access to paid features. */
const ENTITLED: ReadonlySet<string> = new Set(['active', 'trialing']);

interface UserLike {
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}

/**
 * The authoritative subscription status for a user.
 *
 * Reads app_metadata ONLY. Returns 'none' when absent, which after the
 * backfill means the user has never had a subscription.
 */
export function readSubscriptionStatus(user: UserLike | null | undefined): SubscriptionStatus {
  const raw = user?.app_metadata?.subscription_status;
  return typeof raw === 'string' ? (raw as SubscriptionStatus) : 'none';
}

/**
 * Whether a user may use paid features right now.
 *
 * `past_due` is intentionally NOT entitled here. The dunning grace period is
 * handled separately in api/index.ts (isPastDueExpired) because it needs the
 * failure timestamp, which is display-side metadata. Callers that must honour
 * the grace window should use that helper; callers gating an expensive
 * operation should use this one and fail closed.
 */
export function isEntitled(user: UserLike | null | undefined): boolean {
  return ENTITLED.has(readSubscriptionStatus(user));
}

/**
 * Internal roles that bypass the paywall for QA/staff purposes. Mirrors the
 * client rule in `auramind-gemini/src/utils/permissions.ts` (hasFreeAccess).
 * Reads `app_metadata.role` ONLY — user_metadata is client-writable and is
 * never an entitlement source.
 */
const FREE_ACCESS_ROLES: ReadonlySet<string> = new Set(['owner', 'ceo', 'admin', 'employee', 'tester']);

/**
 * Entitlement for endpoints that must honour the internal-role free access
 * (the client shows these users an unlocked product via `hasFreeAccess`).
 * Same trust boundary as `isEntitled`: the role is read from app_metadata,
 * which only the service-role key can write.
 */
export function isEntitledWithRoleAccess(user: UserLike | null | undefined): boolean {
  if (isEntitled(user)) return true;
  const role = user?.app_metadata?.role;
  return typeof role === 'string' && FREE_ACCESS_ROLES.has(role);
}

/**
 * Build the `app_metadata` patch for a status change.
 *
 * Callers pass this to `supabase.auth.admin.updateUserById`, which merges at
 * the top level — so spreading the existing app_metadata preserves `role`,
 * which authorises admin access and must never be clobbered by a billing
 * update.
 */
export function entitlementPatch(
  existingAppMetadata: Record<string, unknown> | null | undefined,
  status: SubscriptionStatus,
): Record<string, unknown> {
  return { ...(existingAppMetadata ?? {}), subscription_status: status };
}
