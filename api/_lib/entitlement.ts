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
  /**
   * How long a checkout that was started but never completed may hold access.
   *
   * `stripe/checkout` mirrors `trialing` into app_metadata before redirecting,
   * so a user who is not let in by the webhook's async timing is not bounced
   * back to the paywall. That mirror happens before any money moves, so an
   * abandoned tab would otherwise leave it in place indefinitely — no Stripe
   * subscription exists, so no webhook ever arrives to correct it.
   *
   * The marker is what separates this from a real trial. Stripe's own trials
   * are written by the webhook and have no `trial_armed_at`, so they are
   * untouched by this window and expire on Stripe's schedule.
   */
  const PREARM_WINDOW_DAYS = Number(process.env.PREARM_WINDOW_DAYS || 7);

  export function readSubscriptionStatus(
    user: UserLike | null | undefined,
    now: number = Date.now(),
  ): SubscriptionStatus {
    const raw = user?.app_metadata?.subscription_status;
    const status: SubscriptionStatus = typeof raw === 'string' ? (raw as SubscriptionStatus) : 'none';
    if (status !== 'trialing') return status;
    const armedAt = user?.app_metadata?.trial_armed_at;
    if (typeof armedAt !== 'string') return status; // a real Stripe trial
    const at = Date.parse(armedAt);
    // Unparseable marker: fail closed rather than grant forever.
    if (Number.isNaN(at)) return 'expired';
    return now - at > PREARM_WINDOW_DAYS * 24 * 60 * 60 * 1000 ? 'expired' : status;
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
 *
 * `trial_armed_at` is deliberately DROPPED rather than preserved. That marker
 * means "a checkout was started but no money has moved yet", and it is only
 * ever set by `stripe/checkout` before the redirect. Once Stripe tells us the
 * subscription exists, the marker is stale by definition, and keeping it is
 * not harmless: `readSubscriptionStatus` treats `trialing` + marker as an
 * expiring pre-arm, so a real customer who finished checkout would be cut off
 * mid-trial exactly one `PREARM_WINDOW_DAYS` after arming.
 *
 * Dropping it is also what makes the "a real Stripe trial has no marker"
 * comment above true. Spreading the previous record silently carried the
 * marker forward, so the two states were indistinguishable to the reader.
 *
 * The key is omitted rather than set to null so the whole record can be
 * replaced, and so a re-subscribe after a cancellation does not inherit a
 * marker that would expire the new trial immediately.
 */
export function entitlementPatch(
  existingAppMetadata: Record<string, unknown> | null | undefined,
  status: SubscriptionStatus,
): Record<string, unknown> {
  const { trial_armed_at: _stalePreArm, ...preserved } = existingAppMetadata ?? {};
  return { ...preserved, subscription_status: status };
}
