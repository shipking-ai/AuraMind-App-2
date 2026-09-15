import { describe, it, expect, vi, afterEach } from 'vitest';
import { call } from './helpers.js';

const supabase = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => supabase),
}));

const html = `<!DOCTYPE html>
<html><head><title>Example Domain</title></head>
<body><h1>Example Domain</h1><p>Hello <b>world</b>.</p>
<script>var x = 1;</script>
<style>body { color: red; }</style></body></html>`;

const AUTH = { authorization: 'Bearer good-token' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  supabase.auth.getUser.mockReset();
});

function authed() {
  supabase.auth.getUser.mockResolvedValue({
    data: { user: { id: 'u1', email: 'a@b.c' } },
    error: null,
  });
}

describe('POST /api/fetch-url', () => {
  it('rejects requests without an auth header', async () => {
    const { status, body } = await call('fetch-url', {
      body: { url: 'https://example.com' },
    });
    expect(status).toBe(401);
    expect(body.error).toBe('Missing authorization');
  });

  it('rejects invalid tokens', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { status, body } = await call('fetch-url', {
      headers: AUTH,
      body: { url: 'https://example.com' },
    });
    expect(status).toBe(401);
    expect(body.error).toBe('Invalid token');
  });

  it('extracts title and text from a URL', async () => {
    authed();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => html,
    })));

    const { status, body } = await call('fetch-url', {
      headers: AUTH,
      body: { url: 'https://example.com' },
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Example Domain');
    expect(body.data.text).toContain('Hello world');
    expect(body.data.text).not.toContain('script');
    expect(body.data.text).not.toContain('<b>');
    expect(body.data.url).toBe('https://example.com');
  });

  it('rejects a non-URL body with 400', async () => {
    authed();
    const { status, body } = await call('fetch-url', {
      headers: AUTH,
      body: { url: 'not-a-url' },
    });
    expect(status).toBe(400);
    expect(body.error).toBe('Validation failed');
  });

  it('returns 502 when the upstream fetch fails', async () => {
    authed();
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    }));

    const { status, body } = await call('fetch-url', {
      headers: AUTH,
      body: { url: 'https://example.com' },
    });
    expect(status).toBe(502);
    expect(body.error).toContain('getaddrinfo');
  });

  it('returns 502 on a non-2xx upstream response', async () => {
    authed();
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    })));

    const { status, body } = await call('fetch-url', {
      headers: AUTH,
      body: { url: 'https://example.com/missing' },
    });
    expect(status).toBe(502);
    expect(body.error).toContain('404');
  });
});
