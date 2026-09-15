import { describe, it, expect, vi, afterEach } from 'vitest';
import { call } from './helpers.js';
import { isPastDueExpired } from '../index.js';

const supabase = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
    admin: {
      getUserById: vi.fn(),
      updateUserById: vi.fn(),
      listUsers: vi.fn(),
    },
  },
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabase),
}));

afterEach(() => {
  vi.restoreAllMocks();
  supabase.auth.getUser.mockReset();
  supabase.auth.admin.getUserById.mockReset();
  supabase.auth.admin.updateUserById.mockReset();
  supabase.auth.admin.listUsers.mockReset();
  supabase.from.mockReset();
  supabase.rpc.mockReset();
});

const USER_ID = '00000000-0000-4000-8000-000000000001';
const AUTH = { authorization: 'Bearer valid-token' };

describe('POST /api/subscription (entitlement lookup)', () => {
  it('401s without a bearer token', async () => {
    const { status } = await call('subscription', { body: { userId: USER_ID } });
    expect(status).toBe(401);
    expect(supabase.auth.admin.getUserById).not.toHaveBeenCalled();
  });

  it('401s with an invalid token', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error('invalid') });
    const { status } = await call('subscription', { headers: AUTH, body: { userId: USER_ID } });
    expect(status).toBe(401);
  });

  it('403s when the body userId differs from the token subject', async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: 'me@example.com', user_metadata: {} } },
      error: null,
    });
    const { status } = await call('subscription', {
      headers: AUTH,
      body: { userId: '00000000-0000-4000-8000-000000009999' },
    });
    expect(status).toBe(403);
    expect(supabase.auth.admin.getUserById).not.toHaveBeenCalled();
  });

  it('returns status and plan for the authenticated caller', async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: 'me@example.com', user_metadata: {} } },
      error: null,
    });
    supabase.auth.admin.getUserById.mockResolvedValue({
      data: { user: { id: USER_ID,
        // Entitlement lives in app_metadata now — user_metadata is
        // client-writable and is display data only.
        app_metadata: { subscription_status: 'active' },
        user_metadata: { subscription_status: 'active', plan: 'Pro' } } },
      error: null,
    });

    const { status, body } = await call('subscription', { headers: AUTH, body: {} });
    expect(status).toBe(200);
    expect(body).toEqual({ subscribed: true, status: 'active', plan: 'Pro' });
    // Looks up the TOKEN user, not any body-supplied id.
    expect(supabase.auth.admin.getUserById).toHaveBeenCalledWith(USER_ID);
  });

  it('reports unsubscribed defaults for a fresh user', async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: 'me@example.com', user_metadata: {} } },
      error: null,
    });
    supabase.auth.admin.getUserById.mockResolvedValue({
      data: { user: { id: USER_ID, user_metadata: {} } },
      error: null,
    });

    const { status, body } = await call('subscription', { headers: AUTH, body: {} });
    expect(status).toBe(200);
    expect(body).toEqual({ subscribed: false, status: 'none', plan: 'Starter' });
  });

  it('keeps past_due users subscribed during the dunning grace window', async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: 'me@example.com', user_metadata: {} } },
      error: null,
    });
    supabase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          id: USER_ID,
          app_metadata: { subscription_status: 'past_due' },
          user_metadata: {
            subscription_status: 'past_due',
            plan: 'Pro',
            last_payment_failure_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
          },
        },
      },
      error: null,
    });

    const { status, body } = await call('subscription', { headers: AUTH, body: {} });
    expect(status).toBe(200);
    expect(body.subscribed).toBe(true);
    expect(body.status).toBe('past_due');
  });

  it('expires past_due users once the grace window elapses', async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: 'me@example.com', user_metadata: {} } },
      error: null,
    });
    supabase.auth.admin.getUserById.mockResolvedValue({
      data: {
        user: {
          id: USER_ID,
          app_metadata: { subscription_status: 'past_due' },
          user_metadata: {
            subscription_status: 'past_due',
            plan: 'Pro',
            last_payment_failure_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
          },
        },
      },
      error: null,
    });

    const { status, body } = await call('subscription', { headers: AUTH, body: {} });
    expect(status).toBe(200);
    expect(body.subscribed).toBe(false);
    expect(body.status).toBe('expired');
  });
});

describe('dunning grace window (isPastDueExpired)', () => {
  const DAY = 24 * 60 * 60 * 1000;

  it('is false for non-past_due statuses', () => {
    expect(isPastDueExpired({ subscription_status: 'active' })).toBe(false);
    expect(isPastDueExpired({ subscription_status: 'trialing' })).toBe(false);
    expect(isPastDueExpired({})).toBe(false);
  });

  it('is false within the grace window, true after it', () => {
    const now = Date.now();
    expect(isPastDueExpired(
      { subscription_status: 'past_due', last_payment_failure_at: new Date(now - 2 * DAY).toISOString() },
      now,
    )).toBe(false);
    expect(isPastDueExpired(
      { subscription_status: 'past_due', last_payment_failure_at: new Date(now - 8 * DAY).toISOString() },
      now,
    )).toBe(true);
  });

  it('treats a missing failure timestamp as expired (fail closed)', () => {
    expect(isPastDueExpired({ subscription_status: 'past_due' })).toBe(true);
  });
});

describe('GET /api/cron/dunning (scheduled maintenance)', () => {
  it('401s without the cron secret', async () => {
    const { status } = await call('cron/dunning', { method: 'GET' });
    expect(status).toBe(401);
  });

  it('401s with a wrong secret', async () => {
    const { status } = await call('cron/dunning', {
      method: 'GET',
      headers: { authorization: 'Bearer wrong-secret' },
    });
    expect(status).toBe(401);
  });

  it('runs with the right secret and summarizes its work', async () => {
    const pastGrace = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString();
    const trialEndingSoon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

    supabase.auth.admin.listUsers.mockResolvedValue({
      data: {
        users: [
          // past_due beyond the grace window → downgrade + cancellation email
          {
            id: '00000000-0000-4000-8000-00000000a001',
            email: 'expired@example.com',
            user_metadata: {
              subscription_status: 'past_due',
              plan: 'Pro',
              last_payment_failure_at: pastGrace,
            },
          },
          // trialing, ends in 2 days, no reminder yet → 3-day reminder
          {
            id: '00000000-0000-4000-8000-00000000a002',
            email: 'trials@example.com',
            user_metadata: {
              subscription_status: 'trialing',
              trial_end: trialEndingSoon,
            },
          },
          // active — untouched
          {
            id: '00000000-0000-4000-8000-00000000a003',
            email: 'active@example.com',
            user_metadata: { subscription_status: 'active', plan: 'Pro' },
          },
        ],
      },
      error: null,
    });
    supabase.auth.admin.updateUserById.mockResolvedValue({ error: null });
    supabase.rpc.mockResolvedValue({ data: null, error: null });

    // Resend is mocked at the module level in other suites; here the key is
    // set (vitest config) but Resend will fail to send — that's fine, the
    // metadata downgrade must happen regardless and emailErrors is reported.
    const { status, body } = await call('cron/dunning', {
      method: 'GET',
      headers: { authorization: 'Bearer test-cron-secret' },
    });

    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.scanned).toBe(3);
    expect(body.dunningExpired).toBe(1);
    expect(body.trialReminders3d + body.emailErrors).toBeGreaterThanOrEqual(1);
    // The expired user was downgraded.
    expect(supabase.auth.admin.updateUserById).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-00000000a001',
      expect.objectContaining({
        user_metadata: expect.objectContaining({ subscription_status: 'expired', plan: 'Starter' }),
      }),
    );
  });
});

describe('fetch-url SSRF guard', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function authedFetchUser() {
    supabase.auth.getUser.mockResolvedValue({
      data: { user: { id: USER_ID, email: 'me@example.com', user_metadata: {} } },
      error: null,
    });
  }

  it('blocks localhost hostnames', async () => {
    authedFetchUser();
    const { status, body } = await call('fetch-url', { headers: AUTH, body: { url: 'http://localhost:8080/admin' } });
    expect(status).toBe(400);
    expect(body.error).toMatch(/internal/i);
  });

  it('blocks private IPv4 literals', async () => {
    authedFetchUser();
    for (const url of ['http://10.0.0.5/', 'http://192.168.1.1/', 'http://172.16.0.9/']) {
      const { status } = await call('fetch-url', { headers: AUTH, body: { url } });
      expect(status).toBe(400);
    }
  });

  it('blocks the cloud metadata endpoint', async () => {
    authedFetchUser();
    const { status, body } = await call('fetch-url', { headers: AUTH, body: { url: 'http://169.254.169.254/latest/meta-data/' } });
    expect(status).toBe(400);
    expect(body.error).toMatch(/private/i);
  });

  it('blocks non-http(s) schemes', async () => {
    authedFetchUser();
    const { status } = await call('fetch-url', { headers: AUTH, body: { url: 'file:///etc/passwd' } });
    expect(status).toBe(400);
  });

  it('blocks URLs with embedded credentials', async () => {
    authedFetchUser();
    const { status } = await call('fetch-url', { headers: AUTH, body: { url: 'http://user:pass@example.com/' } });
    expect(status).toBe(400);
  });

  it('allows a public URL through to fetch (mocked 200)', async () => {
    // example.com resolves publicly; mock fetch so the test is hermetic.
    authedFetchUser();
    const mockResponse = new Response('<html><title>Public Page</title><body>Hello world</body></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    });
    Object.defineProperty(mockResponse, 'url', { value: 'https://example.com/' });
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse) as any;

    const { status, body } = await call('fetch-url', { headers: AUTH, body: { url: 'https://example.com/' } });
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Public Page');
  });
});
