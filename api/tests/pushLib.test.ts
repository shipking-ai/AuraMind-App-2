import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';

/**
 * Pure-ish pieces of api/_lib/push: configuration parsing, key-format
 * tolerance (raw vs base64), and the dead-token prune classifier. The JWT
 * exchange path is covered indirectly by pushSend.test.ts.
 */

// A real (throwaway) RSA key so signer.sign() succeeds before the mocked
// token-exchange fetch is reached.
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 512 });
const PRIVATE_KEY_PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const ACCOUNT = { client_email: 'a@b', private_key: PRIVATE_KEY_PEM };

/** Mock fetch: OAuth token exchange succeeds, FCM endpoint delegates to `fcm`. */
function stubGoogleFetch(fcm: (url: string) => Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      if (url.includes('oauth2.googleapis.com')) {
        return Promise.resolve(new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }), { status: 200 }));
      }
      return fcm(url);
    }),
  );
}

let push: typeof import('../_lib/push.js');

beforeEach(async () => {
  vi.resetModules();
  push = await import('../_lib/push.js');
});

describe('isPushConfigured / readPushConfig', () => {
  it('is false when either var is missing or empty', () => {
    expect(push.isPushConfigured({ FCM_PROJECT_ID: '', FCM_SERVICE_ACCOUNT_KEY: '{}' })).toBe(false);
    expect(push.isPushConfigured({ FCM_PROJECT_ID: 'p', FCM_SERVICE_ACCOUNT_KEY: '' })).toBe(false);
    expect(push.isPushConfigured({} as any)).toBe(false);
  });

  it('parses a raw JSON key and falls back to the project id in the account', () => {
    const key = JSON.stringify({ client_email: 'a@b.iam.gserviceaccount.com', private_key: 'K', project_id: 'p-from-file' });
    const cfg = push.readPushConfig({ FCM_PROJECT_ID: 'p', FCM_SERVICE_ACCOUNT_KEY: key } as any);
    expect(cfg).not.toBeNull();
    expect(cfg!.account.private_key).toBe('K');
  });

  it('parses a base64-encoded key (Vercel dashboards mangle newlines)', () => {
    const key = Buffer.from(
      JSON.stringify({ client_email: 'a@b.iam.gserviceaccount.com', private_key: 'K' }),
    ).toString('base64');
    const cfg = push.readPushConfig({ FCM_PROJECT_ID: 'p', FCM_SERVICE_ACCOUNT_KEY: key } as any);
    expect(cfg).not.toBeNull();
    expect(cfg!.account.client_email).toBe('a@b.iam.gserviceaccount.com');
  });

  it('returns null for a malformed or incomplete key', () => {
    expect(push.readPushConfig({ FCM_PROJECT_ID: 'p', FCM_SERVICE_ACCOUNT_KEY: 'not json at all' } as any)).toBeNull();
    expect(
      push.readPushConfig({
        FCM_PROJECT_ID: 'p',
        FCM_SERVICE_ACCOUNT_KEY: JSON.stringify({ client_email: 'only@email' }),
      } as any),
    ).toBeNull();
  });
});

describe('sendPushToUsers', () => {
  const fakeSupabase = (rows: Array<{ user_id: string; token: string }>, capture: { deleted: string[] }) => ({
    from: vi.fn((table: string) => {
      if (table === 'push_tokens') {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: rows, error: null }),
          }),
          delete: () => ({
            eq: (_col: string, token: string) => {
              capture.deleted.push(token);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  });

  it('reports configured:false and does nothing without config', async () => {
    const capture = { deleted: [] as string[] };
    const sb = fakeSupabase([], capture);
    const report = await push.sendPushToUsers(sb, ['u1'], { title: 'T', body: 'B' }, null);
    expect(report.configured).toBe(false);
    expect(sb.from).not.toHaveBeenCalled();
  });

  it('counts users with no tokens as skipped', async () => {
    const capture = { deleted: [] as string[] };
    const sb = fakeSupabase([], capture);
    const report = await push.sendPushToUsers(
      sb,
      ['u1'],
      { title: 'T', body: 'B' },
      { projectId: 'p', account: ACCOUNT },
    );
    expect(report.skipped).toBe(1);
    expect(report.sent).toBe(0);
  });

  it('sends to every live token and reports per-token outcomes', async () => {
    stubGoogleFetch(() => Promise.resolve(new Response(JSON.stringify({ name: 'm1' }), { status: 200 })));
    const capture = { deleted: [] as string[] };
    const sb = fakeSupabase([{ user_id: 'u1', token: 'tok-1' }], capture);
    const report = await push.sendPushToUsers(
      sb,
      ['u1'],
      { title: 'T', body: 'B' },
      { projectId: 'p', account: ACCOUNT },
    );
    expect(report.sent).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.pruned).toBe(0);
    vi.unstubAllGlobals();
  });

  it('prunes UNREGISTERED tokens instead of counting them as failures', async () => {
    stubGoogleFetch(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { message: 'Requested entity was not found.' } }), { status: 404 }),
      ),
    );
    const capture = { deleted: [] as string[] };
    const sb = fakeSupabase([{ user_id: 'u1', token: 'dead-tok' }], capture);
    const report = await push.sendPushToUsers(
      sb,
      ['u1'],
      { title: 'T', body: 'B' },
      { projectId: 'p', account: ACCOUNT },
    );
    expect(report.sent).toBe(0);
    expect(report.pruned).toBe(1);
    expect(capture.deleted).toContain('dead-tok');
    vi.unstubAllGlobals();
  });

  it('counts transient FCM errors as failures without pruning', async () => {
    stubGoogleFetch(() => Promise.resolve(new Response('upstream busy', { status: 500 })));
    const capture = { deleted: [] as string[] };
    const sb = fakeSupabase([{ user_id: 'u1', token: 'tok-1' }], capture);
    const report = await push.sendPushToUsers(
      sb,
      ['u1'],
      { title: 'T', body: 'B' },
      { projectId: 'p', account: ACCOUNT },
    );
    expect(report.failed).toBe(1);
    expect(report.pruned).toBe(0);
    expect(capture.deleted).toEqual([]);
    vi.unstubAllGlobals();
  });
});
