import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { call } from './helpers.js';

/** Photos of notes / textbook pages -> text, through Gemini's image input. */

const supabase = vi.hoisted(() => ({
  auth: { getUser: vi.fn() },
  from: vi.fn(() => ({ insert: vi.fn().mockResolvedValue({ error: null }) })),
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => supabase) }));

const user = (status: string) => ({
  data: { user: { id: 'u1', email: 'u@b.co', app_metadata: { subscription_status: status }, user_metadata: {} } },
  error: null,
});
const asPro = () => supabase.auth.getUser.mockResolvedValue(user('active'));
const asFree = () => supabase.auth.getUser.mockResolvedValue(user('none'));
const authed = (body: unknown) => ({ headers: { authorization: 'Bearer token' }, body });
const jpeg = () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64');

/** Gemini's OpenAI-compatible reply carrying `content`. */
function stubGemini(content: string, status = 200) {
  const fetch = vi.fn(async (_url: string, _init: { body: string; headers: Record<string, string> }) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
  }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

beforeEach(() => vi.stubEnv('GEMINI_API_KEY', 'g-key'));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  supabase.auth.getUser.mockReset();
});

describe('POST /api/extract/image', () => {
  it('sends every page as a data URI to the Gemini vision model', async () => {
    asPro();
    const fetch = stubGemini('Photosynthesis makes glucose.');
    const r = await call('extract/image', authed({ images: [jpeg(), jpeg()] }));
    expect(r.status).toBe(200);
    expect(r.body.data.text).toBe('Photosynthesis makes glucose.');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer g-key');
    const sent = JSON.parse(init.body);
    expect(sent.model).toBe('gemini-2.0-flash');
    const parts = sent.messages[0].content;
    expect(parts[0].type).toBe('text');
    expect(parts[0].text).toMatch(/handwriting/);
    expect(parts.filter((p: { type: string }) => p.type === 'image_url')).toHaveLength(2);
    expect(parts[1].image_url.url).toBe(`data:image/jpeg;base64,${jpeg()}`);
  });

  it('uses GEMINI_VISION_MODEL when set', async () => {
    asPro();
    vi.stubEnv('GEMINI_VISION_MODEL', 'gemini-2.5-flash');
    const fetch = stubGemini('text');
    await call('extract/image', authed({ images: [jpeg()] }));
    expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe('gemini-2.5-flash');
  });

  it('401 without a token and 402 for a free user, before any model call', async () => {
    const fetch = stubGemini('x');
    expect((await call('extract/image', { body: { images: [jpeg()] } })).status).toBe(401);
    asFree();
    expect((await call('extract/image', authed({ images: [jpeg()] }))).status).toBe(402);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('400 for no images or more than 5', async () => {
    asPro();
    stubGemini('x');
    expect((await call('extract/image', authed({ images: [] }))).body.code).toBe('bad_request');
    expect((await call('extract/image', authed({ images: Array(6).fill(jpeg()) }))).body.code).toBe('bad_request');
  });

  it('413 for an image over 1.5 MB', async () => {
    asPro();
    stubGemini('x');
    const big = Buffer.alloc(1.5 * 1024 * 1024 + 1, 1).toString('base64');
    const r = await call('extract/image', authed({ images: [big] }));
    expect(r.status).toBe(413);
    expect(r.body.code).toBe('too_large');
  });

  it('503 with neither a Gemini nor a Groq key', async () => {
    asPro();
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('GROQ_API_KEY', '');
    const fetch = stubGemini('x');
    const r = await call('extract/image', authed({ images: [jpeg()] }));
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('unavailable');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('422 when the model finds no text', async () => {
    asPro();
    stubGemini('NO_TEXT');
    expect((await call('extract/image', authed({ images: [jpeg()] }))).body.code).toBe('no_text');
    stubGemini('   ');
    expect((await call('extract/image', authed({ images: [jpeg()] }))).status).toBe(422);
  });

  it('503 when Gemini fails', async () => {
    asPro();
    stubGemini('', 500);
    const r = await call('extract/image', authed({ images: [jpeg()] }));
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('unavailable');
  });

  // Vercel has a Groq key but no Gemini key: photos go through Groq's image
  // model, capped below its free-tier 1,000 output tokens per minute.
  it("reads photos with Groq's vision model when there is no Gemini key", async () => {
    asPro();
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    const fetch = stubGemini('Photosynthesis makes glucose.');
    const r = await call('extract/image', authed({ images: [jpeg(), jpeg()] }));
    expect(r.status).toBe(200);
    expect(r.body.data.text).toBe('Photosynthesis makes glucose.');
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer groq-key');
    const sent = JSON.parse(init.body);
    expect(sent.model).toBe('qwen/qwen3.8-27b');
    expect(sent.max_tokens).toBe(900);
    expect(sent.messages[0].content.filter((p: { type: string }) => p.type === 'image_url')).toHaveLength(2);
  });

  it('uses GROQ_VISION_MODEL when set', async () => {
    asPro();
    vi.stubEnv('GEMINI_API_KEY', '');
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    vi.stubEnv('GROQ_VISION_MODEL', 'qwen/qwen4-vision');
    const fetch = stubGemini('text');
    await call('extract/image', authed({ images: [jpeg()] }));
    expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe('qwen/qwen4-vision');
  });

  it('falls back to Groq when Gemini fails', async () => {
    asPro();
    vi.stubEnv('GROQ_API_KEY', 'groq-key');
    const fetch = vi.fn(async (url: string) => (url.includes('googleapis')
      ? { ok: false, status: 503, json: async () => ({}), text: async () => '' }
      : { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'From Groq.' } }] }), text: async () => '' }));
    vi.stubGlobal('fetch', fetch);
    const r = await call('extract/image', authed({ images: [jpeg()] }));
    expect(r.body.data.text).toBe('From Groq.');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
