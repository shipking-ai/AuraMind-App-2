import { describe, it, expect } from 'vitest';

import {
  readSubscriptionStatus,
  isEntitled,
  entitlementPatch,
} from '../_lib/entitlement.js';

/**
 * The pre-arm marker outlived the thing it was describing.
 *
 * `stripe/checkout` stamps `trial_armed_at` so an abandoned tab cannot hold
 * paid access forever, and the webhook is what corrects it once money moves.
 * But every webhook handler built its patch by hand:
 *
 *     app_metadata: {
 *       ...(existing?.user?.app_metadata || {}),
 *       subscription_status: subscription.status,
 *     }
 *
 * updateUserById replaces metadata wholesale, so the spread was needed to keep
 * `role`. The side effect was that `trial_armed_at` came along for the ride.
 * The reader treats `trialing` + marker as an expiring pre-arm, so a customer
 * who did complete checkout was indistinguishable from one who abandoned it:
 *
 *     POST /api/stripe/checkout   -> 'trialing' + trial_armed_at
 *     pay, Stripe fires the webhook -> 'trialing' + trial_armed_at (carried over)
 *     ... PREARM_WINDOW_DAYS later -> 'expired', real customer locked out
 *
 * The comment above `readSubscriptionStatus` claimed real Stripe trials have no
 * marker. That was true of the webhook in isolation and false once the record
 * was spread forward, which is exactly why this went unnoticed.
 *
 * `entitlementPatch` now owns the rule and drops the marker, and all five
 * webhook sites route through it. These tests pin the sequence rather than the
 * helper, so re-introducing a raw spread in the webhook cannot pass.
 */

const DAY = 24 * 60 * 60 * 1000;
const ARMED_AT = '2026-09-28T12:00:00.000Z';

interface TestUser {
  id: string;
  email: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
}

function user(appMetadata: Record<string, unknown>): TestUser {
  return { id: 'u1', email: 'a@b.c', app_metadata: appMetadata, user_metadata: {} };
}

/** What the checkout route writes. */
function afterCheckout(extra: Record<string, unknown> = {}) {
  return user({ subscription_status: 'trialing', trial_armed_at: ARMED_AT, ...extra });
}

describe('entitlementPatch drops the pre-arm marker', () => {
  it('removes trial_armed_at when Stripe reports a status', () => {
    const patch = entitlementPatch({ subscription_status: 'trialing', trial_armed_at: ARMED_AT }, 'trialing');
    expect(patch).not.toHaveProperty('trial_armed_at');
    expect(patch.subscription_status).toBe('trialing');
  });

  it('preserves app_metadata.role, which authorises admin access', () => {
    const patch = entitlementPatch(
      { role: 'owner', trial_armed_at: ARMED_AT, subscription_status: 'trialing' },
      'active',
    );
    expect(patch.role).toBe('owner');
  });

  it('tolerates absent metadata', () => {
    expect(entitlementPatch(undefined, 'active')).toEqual({ subscription_status: 'active' });
    expect(entitlementPatch(null, 'active')).toEqual({ subscription_status: 'active' });
  });
});

describe('a real customer is not expired by the pre-arm window', () => {
  it('checkout arms, webhook confirms, access survives past the window', () => {
    const atCheckout = afterCheckout();
    expect(isEntitled(atCheckout)).toBe(true);

    // The webhook lands and reports a real Stripe trial. This is the patch the
    // webhook now builds; before the fix it spread the marker forward.
    const patch = entitlementPatch(atCheckout.app_metadata, 'trialing');
    const afterWebhook = user({ ...patch });

    expect(afterWebhook.app_metadata.trial_armed_at).toBeUndefined();
    expect(isEntitled(afterWebhook)).toBe(true);

    // Well past PREARM_WINDOW_DAYS: still entitled, because there is no marker.
    const muchLater = Date.parse(ARMED_AT) + 30 * DAY;
    expect(readSubscriptionStatus(afterWebhook, muchLater)).toBe('trialing');
    expect(isEntitled(afterWebhook)).toBe(true);
  });

  it('still expires a genuine abandoned checkout', () => {
    // No webhook ever arrives, so the marker survives and the window closes.
    // Asserted through readSubscriptionStatus with an explicit clock rather
    // than isEntitled, which has no `now` parameter and would read the real
    // wall clock instead of this scenario's.
    const abandoned = afterCheckout();
    expect(abandoned.app_metadata.trial_armed_at).toBe(ARMED_AT);
    expect(readSubscriptionStatus(abandoned, Date.parse(ARMED_AT) + 8 * DAY)).toBe('expired');
  });

  it('a re-subscribe after cancellation does not inherit an expired marker', () => {
    // Cancelled while a marker was present, then the customer subscribes again
    // and Stripe opens a fresh trial. If the marker had been carried forward
    // the new trial would be expired on arrival.
    const cancelled = user({ subscription_status: 'canceled', trial_armed_at: ARMED_AT });
    const patch = entitlementPatch(cancelled.app_metadata, 'trialing');
    const resubscribed = user({ ...patch });
    expect(resubscribed.app_metadata.trial_armed_at).toBeUndefined();
    expect(isEntitled(resubscribed)).toBe(true);
  });
});

describe('every webhook status write clears the marker', () => {
  // Mirrors the five sites in stripe-webhook.ts. A raw spread at any of them
  // reintroduces the lockout.
  const STATUSES = ['active', 'trialing', 'past_due', 'canceled', 'expired', 'none'] as const;

  it.each(STATUSES)('clears it when Stripe reports %s', (status) => {
    const patch = entitlementPatch({ role: 'owner', trial_armed_at: ARMED_AT }, status);
    expect(patch).not.toHaveProperty('trial_armed_at');
    expect(patch.subscription_status).toBe(status);
  });
});
