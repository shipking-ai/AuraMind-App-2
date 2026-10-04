import { describe, it, expect } from 'vitest';

import {
  readSubscriptionStatus,
  isEntitled,
  isEntitledWithRoleAccess,
} from '../_lib/entitlement.js';

/**
 * Regression cover for an abandoned-checkout grant.
 *
 * `stripe/checkout` mirrors `trialing` into app_metadata before redirecting, so
 * a buyer whose webhook has not landed yet is not bounced straight back to the
 * paywall. That mirror happens before any money moves, which made it an
 * unconditional grant:
 *
 *     POST /api/stripe/checkout   -> app_metadata.subscription_status = 'trialing'
 *     close the tab, never pay
 *     -> no Stripe subscription exists, so no webhook ever arrives
 *     -> 'trialing' is in ENTITLED, so paid features stay open indefinitely
 *
 * Two things close it. Checkout only mirrors for a caller who is not already
 * entitled, and the mirror carries a `trial_armed_at` marker that
 * `readSubscriptionStatus` uses to expire it. The marker is what keeps a real
 * Stripe trial — which the webhook writes, with no marker — on Stripe's own
 * schedule.
 */
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-29T12:00:00.000Z');

function user(appMetadata: Record<string, unknown>) {
  return { id: 'u1', email: 'a@b.c', app_metadata: appMetadata, user_metadata: {} } as never;
}

describe('abandoned checkout pre-arm', () => {
  it('keeps access while the pre-arm window is open', () => {
    const u = user({ subscription_status: 'trialing', trial_armed_at: '2026-09-27T12:00:00.000Z' });
    expect(readSubscriptionStatus(u, NOW)).toBe('trialing');
    expect(isEntitled(u, NOW)).toBe(true);
  });

  it('expires a pre-arm that was never completed', () => {
    const u = user({ subscription_status: 'trialing', trial_armed_at: '2026-09-01T12:00:00.000Z' });
    expect(readSubscriptionStatus(u, NOW)).toBe('expired');
    expect(isEntitled(u, NOW)).toBe(false);
  });

  it('expires at exactly the window boundary', () => {
    const just = new Date(NOW - 7 * DAY).toISOString();
    const past = new Date(NOW - 7 * DAY - 1000).toISOString();
    expect(readSubscriptionStatus(user({ subscription_status: 'trialing', trial_armed_at: just }), NOW)).toBe('trialing');
    expect(readSubscriptionStatus(user({ subscription_status: 'trialing', trial_armed_at: past }), NOW)).toBe('expired');
  });

  it('leaves a real Stripe trial alone — it has no marker', () => {
    const u = user({ subscription_status: 'trialing' });
    expect(readSubscriptionStatus(u, NOW)).toBe('trialing');
    expect(isEntitled(u, NOW)).toBe(true);
  });

  it('fails closed on an unparseable marker', () => {
    const u = user({ subscription_status: 'trialing', trial_armed_at: 'not-a-date' });
    expect(readSubscriptionStatus(u, NOW)).toBe('expired');
  });

  it('never affects an active subscription', () => {
    const u = user({ subscription_status: 'active', trial_armed_at: '2020-01-01T00:00:00.000Z' });
    expect(readSubscriptionStatus(u, NOW)).toBe('active');
    expect(isEntitled(u, NOW)).toBe(true);
  });

  it('does not re-open the paywall for staff, even on a stale pre-arm', () => {
    // isEntitledWithRoleAccess is the check checkout now gates the mirror on,
    // so an internal role keeps access regardless of the marker.
    const u = user({ subscription_status: 'trialing', trial_armed_at: '2020-01-01T00:00:00.000Z', role: 'admin' });
    expect(isEntitledWithRoleAccess(u)).toBe(true);
  });
});
