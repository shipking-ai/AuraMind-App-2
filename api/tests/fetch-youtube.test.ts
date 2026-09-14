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

const videoPage = `<html><head><title>Cool Video - YouTube</title></head><body></body></html>`;
const transcript = JSON.stringify([
  { text: 'Hello', duration: 1 },
  { text: 'world', duration: 1 },
  { text: 'this is a test', duration: 2 },
]);

describe('POST /api/fetch-youtube-transcript', () => {
  it('rejects requests without an auth header', async () => {
    const { status, body } = await call('fetch-youtube-transcript', {
      body: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    });
    expect(status).toBe(401);
    expect(body.error).toBe('Missing authorization');
  });

  it('rejects invalid tokens', async () => {
    supabase.auth.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const { status, body } = await call('fetch-youtube-transcript', {
      headers: AUTH,
      body: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    });
    expect(status).toBe(401);
    expect(body.error).toBe('Invalid token');
  });

  it('extracts a title and joins transcript segments', async () => {
    authed();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => videoPage })
      .mockResolvedValueOnce({ ok: true, json: async () => JSON.parse(transcript) });
    vi.stubGlobal('fetch', fetchMock);

    const { status, body } = await call('fetch-youtube-transcript', {
      headers: AUTH,
      body: { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.title).toBe('Cool Video');
    expect(body.data.text).toBe('Hello world this is a test');
    expect(body.data.videoId).toBe('dQw4w9WgXcQ');
  });

  it('rejects a non-YouTube URL with 400', async () => {
    authed();
    const { status, body } = await call('fetch-youtube-transcript', {
      headers: AUTH,
      body: { url: 'https://example.com' },
    });
    expect(status).toBe(400);
    expect(body.error).toBe('Invalid YouTube URL');
  });

  it('returns a graceful error field when the transcript is unavailable', async () => {
    authed();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => videoPage })
      .mockResolvedValueOnce({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetchMock);

    const { status, body } = await call('fetch-youtube-transcript', {
      headers: AUTH,
      body: { url: 'youtu.be/abc123xyz00' },
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.text).toBe('');
    expect(body.data.error).toContain('Transcript not available');
  });
});
