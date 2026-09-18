import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { call } from './helpers.js';
import {
  isEntitled,
  isEntitledWithRoleAccess,
  readSubscriptionStatus,
} from '../_lib/entitlement.js';

/**
 * Regression cover for a paywall bypass.
 *
 * `subscription_status` used to live in `user_metadata`, which Supabase lets
 * a signed-in user write for themselves:
 *
 *     await supabase.auth.updateUser({ data: { subscription_status: 'active' } })
 *
 * The Stripe webhook wrote it there and /api/subscription read it back, so
 * the server gated billing on a field the client controls — any account could
 * grant itself a permanent free subscription with one line.
 *
 * Entitlement now reads `app_metadata`, which only the service-role key can
 * write. These tests assert the forged value is ignored, so a future
 * "fallback to user_metadata for compatibility" cannot quietly reopen it.
 */

const supabase = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
    admin: { getUserById: vi.fn(), updateUserById: vi.fn() },
  },
  from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) })),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => supabase) }));

const AUTHED = { headers: { authorization: 'Bearer token' } };

/**
 * True when the stubbed fetch was pointed at a billable AI provider. The
 * distributed rate limiter (Upstash) legitimately calls fetch from the
 * middleware before the handler answers, so "no fetch at all" is the wrong
 * assertion on machines where UPSTASH_* is configured — provider URLs are
 * what actually cost money.
 */
function providerCallCount(fetchMock: { mock: { calls: unknown[][] } }): number {
  return fetchMock.mock.calls.filter(([url]) => {
    return typeof url === 'string' && /groq|cerebras|gemini|openrouter/i.test(url);
  }).length;
}

beforeEach(() => {
  vi.stubEnv('GROQ_API_KEY', 'test-groq');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  supabase.auth.getUser.mockReset();
  supabase.auth.admin.getUserById.mockReset();
});

describe('entitlement is read from app_metadata only', () => {
  it('ignores a subscription_status forged in user_metadata', () => {
    const forged = {
      app_metadata: {},
      user_metadata: { subscription_status: 'active' },
    };
    expect(
      readSubscriptionStatus(forged),
      'user_metadata is client-writable and must never grant entitlement',
    ).toBe('none');
    expect(isEntitled(forged)).toBe(false);
  });

  it('honours app_metadata, which only the service-role key can write', () => {
    expect(isEntitled({ app_metadata: { subscription_status: 'active' } })).toBe(true);
    expect(isEntitled({ app_metadata: { subscription_status: 'trialing' } })).toBe(true);
  });

  it('does not treat past_due or canceled as entitled', () => {
    for (const status of ['past_due', 'canceled', 'expired', 'none']) {
      expect(isEntitled({ app_metadata: { subscription_status: status } }), status).toBe(false);
    }
  });
  it('refuses /api/ai for a user who forged entitlement in user_metadata', async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'attacker',
          email: 'a@b.co',
          app_metadata: {},
          user_metadata: { subscription_status: 'active' }, // self-granted
        },
      },
      error: null,
    });

    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);

    const { status, body } = await call('ai/chat', {
      ...AUTHED,
      body: { messages: [{ role: 'user', content: 'hi' }] },
    });

    expect(status, 'a forged status must not buy AI access').toBe(402);
    expect(body?.code).toBe('subscription_required');
    expect(
      providerCallCount(upstream),
      'the request must be refused before any billable provider call',
    ).toBe(0);
  });

  it('allows /api/ai for a genuinely entitled user', async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'payer',
          email: 'p@b.co',
          app_metadata: { subscription_status: 'active' },
          user_metadata: {},
        },
      },
      error: null,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { role: 'assistant', content: 'ok' } }],
            usage: { completion_tokens: 3 },
          }),
          text: async () => '',
        }) as unknown as Response,
      ),
    );

    const { status } = await call('ai/chat', {
      ...AUTHED,
      body: { messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(status).toBe(200);
  });
});

describe('isEntitledWithRoleAccess — internal roles bypass the paywall', () => {
  it('entitles every internal role from app_metadata', () => {
    for (const role of ['owner', 'ceo', 'admin', 'employee', 'tester']) {
      expect(
        isEntitledWithRoleAccess({ app_metadata: { role } }),
        role,
      ).toBe(true);
    }
  });

  it('still entitles a paid subscription with no role', () => {
    expect(isEntitledWithRoleAccess({ app_metadata: { subscription_status: 'active' } })).toBe(true);
    expect(isEntitledWithRoleAccess({ app_metadata: { subscription_status: 'trialing' } })).toBe(true);
  });

  it('refuses a plain user with no subscription', () => {
    expect(isEntitledWithRoleAccess({ app_metadata: { role: 'user' } })).toBe(false);
    expect(isEntitledWithRoleAccess({ app_metadata: {} })).toBe(false);
    expect(isEntitledWithRoleAccess(null)).toBe(false);
  });

  it('IGNORES a role forged in user_metadata — same attack as the status forgery', () => {
    // A signed-in user can set user_metadata.role = 'tester' with one
    // auth.updateUser call. The role must be read from app_metadata ONLY.
    const forged = {
      app_metadata: {},
      user_metadata: { role: 'tester' },
    };
    expect(isEntitledWithRoleAccess(forged)).toBe(false);
  });

  it('refuses /api/ai for a user who forged the tester role in user_metadata', async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'attacker2',
          email: 't@b.co',
          app_metadata: {},
          user_metadata: { role: 'tester' }, // self-granted
        },
      },
      error: null,
    });

    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);

    const { status, body } = await call('ai/chat', {
      ...AUTHED,
      body: { messages: [{ role: 'user', content: 'hi' }] },
    });

    expect(status, 'a forged tester role must not buy AI access').toBe(402);
    expect(body?.code).toBe('subscription_required');
    expect(
      providerCallCount(upstream),
      'the request must be refused before any billable provider call',
    ).toBe(0);
  });

  it('allows /api/ai for a genuine tester (role set server-side)', async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'tester1',
          email: 'qa@b.co',
          app_metadata: { role: 'tester' },
          user_metadata: { role: 'tester' },
        },
      },
      error: null,
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            choices: [{ message: { role: 'assistant', content: 'ok' } }],
            usage: { completion_tokens: 3 },
          }),
          text: async () => '',
        }) as unknown as Response,
      ),
    );

    const { status } = await call('ai/chat', {
      ...AUTHED,
      body: { messages: [{ role: 'user', content: 'hi' }] },
    });
    expect(status).toBe(200);
  });
});
