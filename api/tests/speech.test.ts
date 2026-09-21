import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { call } from './helpers.js';

/**
 * /api/ai/speech spends Groq TTS budget per character, so it is gated like
 * chat: session + entitlement from app_metadata, a length cap matching
 * Groq's 200-character limit, and an allowlisted voice.
 */

const supabase = vi.hoisted(() => ({
  auth: { getUser: vi.fn() },
  from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) })),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => supabase) }));

const AUTHED = { headers: { authorization: 'Bearer token' } };

function asUser(status: string, userMeta: Record<string, unknown> = {}) {
  supabase.auth.getUser.mockResolvedValue({
    data: {
      user: { id: `u-${status}`, email: 'x@y.co', app_metadata: { subscription_status: status }, user_metadata: userMeta },
    },
    error: null,
  });
}

beforeEach(() => {
  vi.stubEnv('GROQ_API_KEY', 'test-groq');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  supabase.auth.getUser.mockReset();
});

describe('POST /api/ai/speech', () => {
  it('refuses a non-entitled user, even with a forged user_metadata status', async () => {
    asUser('none', { subscription_status: 'active' });
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);

    const { status, body } = await call('ai/speech', { ...AUTHED, body: { text: 'Hi', voice: 'hannah' } });

    expect(status).toBe(402);
    expect(body?.code).toBe('subscription_required');
    expect(upstream).not.toHaveBeenCalled();
  });

  it('rejects text over 200 characters and unknown voices before spending', async () => {
    asUser('active');
    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);

    const long = await call('ai/speech', { ...AUTHED, body: { text: 'a'.repeat(201), voice: 'hannah' } });
    const badVoice = await call('ai/speech', { ...AUTHED, body: { text: 'Hi', voice: 'alloy' } });

    expect(long.status).toBe(413);
    expect(badVoice.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  it('returns WAV bytes from Orpheus for an entitled user', async () => {
    asUser('active');
    const wav = new Uint8Array([82, 73, 70, 70]);
    const upstream = vi.fn(async () => ({ ok: true, status: 200, arrayBuffer: async () => wav.buffer }) as unknown as Response);
    vi.stubGlobal('fetch', upstream);

    const { status, body } = await call('ai/speech', { ...AUTHED, body: { text: 'Hello there.', voice: 'Hannah' } });

    expect(status).toBe(200);
    expect(Buffer.isBuffer(body)).toBe(true);
    const [url, init] = upstream.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/audio/speech');
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'canopylabs/orpheus-v1-english',
      input: 'Hello there.',
      voice: 'hannah',
    });
  });

  it('hides upstream errors (e.g. model terms not accepted) behind a generic 503', async () => {
    asUser('active');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400, text: async () => 'model_terms_required test-groq' }) as unknown as Response));

    const { status, body } = await call('ai/speech', { ...AUTHED, body: { text: 'Hi', voice: 'troy' } });

    expect(status).toBe(503);
    expect(JSON.stringify(body)).not.toContain('test-groq');
  });
});
