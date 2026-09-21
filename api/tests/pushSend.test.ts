import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { call } from './helpers.js';
import { generateKeyPairSync } from 'node:crypto';

// A real (throwaway) RSA key — the signer needs a valid PEM before the
// mocked token exchange is reached.
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 512 });
const SERVICE_KEY_JSON = JSON.stringify({
  client_email: 'a@b.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
});

/**
 * /api/push/send — the FCM send endpoint. Two security properties matter:
 *  1. It is admin-only (app_metadata role, same gate as admin/user list).
 *  2. It fails closed when FCM credentials are absent — reporting
 *     configured: false without touching the network, and never treating
 *     "unconfigured" as an error a client could poke into leaking config.
 *
 * The module-under-test's crypto (JWT signing, token exchange, FCM POSTs)
 * is exercised through the mocked fetch; see also pushLib.test.ts for the
 * pure pieces.
 */

const supabase = vi.hoisted(() => {
  const chain = () => {
    const c: any = {
      select: vi.fn(() => c),
      eq: vi.fn(() => c),
      in: vi.fn(() => Promise.resolve({ data: [], error: null })),
    };
    return c;
  };
  return {
    auth: { getUser: vi.fn() },
    from: vi.fn(() => chain()),
  };
});

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => supabase) }));

const AUTHED = { headers: { authorization: 'Bearer token' } };

function asUser(role: string | null, status = 'active') {
  supabase.auth.getUser.mockResolvedValue({
    data: {
      user: {
        id: 'u-1',
        email: 'u@x.co',
        app_metadata: role ? { role, subscription_status: status } : { subscription_status: status },
      },
    },
    error: null,
  });
}

beforeEach(() => {
  vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  supabase.auth.getUser.mockReset();
});

const VALID_BODY = { userIds: ['11111111-1111-4111-8111-111111111111'], title: 'Hi', body: 'Test' };

describe('POST /api/push/send', () => {
  it('fails closed without FCM credentials: configured:false, no fetch, no auth required', async () => {
    vi.stubEnv('FCM_PROJECT_ID', '');
    vi.stubEnv('FCM_SERVICE_ACCOUNT_KEY', '');
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);

    // Not even authenticated — config check comes first and leaks nothing.
    const { status, body } = await call('push/send', { body: VALID_BODY });

    expect(status).toBe(200);
    expect(body?.configured).toBe(false);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects non-admin roles with 403 when FCM is configured', async () => {
    vi.stubEnv('FCM_PROJECT_ID', 'proj');
    vi.stubEnv('FCM_SERVICE_ACCOUNT_KEY', SERVICE_KEY_JSON);
    asUser(null);
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);

    const { status } = await call('push/send', { ...AUTHED, body: VALID_BODY });

    expect(status).toBe(403);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated callers with 401', async () => {
    vi.stubEnv('FCM_PROJECT_ID', 'proj');
    vi.stubEnv('FCM_SERVICE_ACCOUNT_KEY', SERVICE_KEY_JSON);
    asUser('admin');

    const { status } = await call('push/send', { body: VALID_BODY });

    expect(status).toBe(401);
  });

  it('validates the payload before spending anything', async () => {
    vi.stubEnv('FCM_PROJECT_ID', 'proj');
    vi.stubEnv('FCM_SERVICE_ACCOUNT_KEY', SERVICE_KEY_JSON);
    asUser('admin');
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);

    const empty = await call('push/send', { ...AUTHED, body: { ...VALID_BODY, userIds: [] } });
    const badLink = await call('push/send', {
      ...AUTHED,
      body: { ...VALID_BODY, link: 'https://evil.example' },
    });

    expect(empty.status).toBe(400);
    expect(badLink.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('sends for an entitled admin when a token exists', async () => {
    vi.stubEnv('FCM_PROJECT_ID', 'proj');
    vi.stubEnv('FCM_SERVICE_ACCOUNT_KEY', SERVICE_KEY_JSON);
    asUser('admin');
    // from('push_tokens').select().in() resolves to one token row.
    (supabase.from as any).mockReturnValue({
      select: vi.fn(() => ({
        in: vi.fn(() => Promise.resolve({ data: [{ user_id: '11111111-1111-4111-8111-111111111111', token: 'tok-1' }], error: null })),
      })),
    });
    // URL-aware mock: the OAuth exchange succeeds, the FCM POST succeeds.
    const upstream = vi.fn((url: string) => {
      if (url.includes('oauth2.googleapis.com')) {
        return Promise.resolve(new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ name: 'm1' }), { status: 200 }));
    });
    vi.stubGlobal('fetch', upstream);

    const { status, body } = await call('push/send', {
      ...AUTHED,
      body: { ...VALID_BODY, link: 'auramind://app/dashboard' },
    });

    expect(status).toBe(200);
    expect(body?.configured).toBe(true);
    expect(body?.sent).toBe(1);
  });
});
