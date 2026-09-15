import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { call } from './helpers.js';

/**
 * Transcription spends server-side Whisper budget, so it must be entitled
 * like chat. handleAITranscribe once checked only for a valid session —
 * any signed-in free account could transcribe at 60 req/min without paying.
 */

const supabase = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) })),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => supabase) }));

const AUTHED = { headers: { authorization: 'Bearer token' } };
const AUDIO = { audioBase64: Buffer.from('fake-audio').toString('base64') };

beforeEach(() => {
  vi.stubEnv('GROQ_API_KEY', 'test-groq');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  supabase.auth.getUser.mockReset();
});

describe('POST /api/ai/transcribe entitlement', () => {
  it('refuses a non-entitled user with 402 before any provider call', async () => {
    supabase.auth.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'free',
          email: 'f@b.co',
          app_metadata: { subscription_status: 'none' },
          user_metadata: {},
        },
      },
      error: null,
    });

    const upstream = vi.fn();
    vi.stubGlobal('fetch', upstream);

    const { status, body } = await call('ai/transcribe', {
      ...AUTHED,
      body: AUDIO,
    });

    expect(status).toBe(402);
    expect(body?.code).toBe('subscription_required');
    expect(upstream, 'refused before any billable Whisper call').not.toHaveBeenCalled();
  });

  it('transcribes for an entitled user', async () => {
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
          json: async () => ({ text: 'hello world' }),
          text: async () => '',
        }) as unknown as Response,
      ),
    );

    const { status, body } = await call('ai/transcribe', {
      ...AUTHED,
      body: AUDIO,
    });

    expect(status).toBe(200);
    expect(body?.text).toBe('hello world');
  });
});
