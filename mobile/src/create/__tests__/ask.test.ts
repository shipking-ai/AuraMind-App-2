import { CreateError } from '@bonamind/core';
import { ask } from '../ask';

jest.mock('../../env', () => ({ env: { apiBaseUrl: 'https://www.bonamind.app' } }));
jest.mock('../../data/supabase', () => ({
  getSupabase: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'tok' } } }) } }),
}));

const fetchMock = jest.fn();
beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
});
const reply = (status: number, body: unknown = {}) =>
  fetchMock.mockResolvedValueOnce({ ok: status >= 200 && status < 300, status, json: async () => body });

it('sends the prompt with temperature 0.4 and max_tokens 4096 and returns the reply text', async () => {
  reply(200, { choices: [{ message: { content: '[{"question":"Q","answer":"A"}]' } }] });
  await expect(ask('make cards')).resolves.toBe('[{"question":"Q","answer":"A"}]');
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('https://www.bonamind.app/api/ai/chat');
  expect(init.method).toBe('POST');
  expect(init.headers.Authorization).toBe('Bearer tok');
  expect(JSON.parse(init.body)).toEqual({ messages: [{ role: 'user', content: 'make cards' }], temperature: 0.4, max_tokens: 4096 });
});

it('maps proxy statuses to create errors', async () => {
  for (const [status, kind] of [[402, 'subscription'], [429, 'rate_limited'], [503, 'busy'], [401, 'busy'], [413, 'too_large'], [422, 'unreadable']] as const) {
    reply(status);
    const err = await ask('p').catch((e) => e);
    expect(err).toBeInstanceOf(CreateError);
    expect(err.kind).toBe(kind);
  }
});

it('maps a failed request to offline', async () => {
  fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
  await expect(ask('p')).rejects.toMatchObject({ kind: 'offline' });
});

it('times out after 45s as busy', async () => {
  jest.useFakeTimers();
  try {
    fetchMock.mockImplementationOnce((_url: string, init: { signal: AbortSignal }) => new Promise((_, reject) => {
      init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const pending = ask('p').catch((e) => e);
    await jest.advanceTimersByTimeAsync(45_000);
    expect(await pending).toMatchObject({ kind: 'busy' });
  } finally {
    jest.useRealTimers();
  }
});
