import { LinneaError, linneaErrorLine } from '@bonamind/core';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { kvGet, kvSet } from '../../data/db';
import { useLinneaChat, type StreamFn } from '../useLinneaChat';

jest.mock('../../data/db', () => {
  const mem = new Map<string, unknown>();
  return { kvGet: jest.fn((k: string) => mem.get(k)), kvSet: jest.fn(async (k: string, v: unknown) => { mem.set(k, v); }), __mem: mem };
});
const mem: Map<string, unknown> = (jest.requireMock('../../data/db') as any).__mem;

function scripted(...turns: ((signal?: { aborted: boolean }) => AsyncGenerator<string>)[]): StreamFn {
  let i = 0;
  return (opts) => turns[i++](opts.signal);
}
async function* say(...parts: string[]) { for (const p of parts) yield p; }

const base = { userId: 'u1', token: 'tok', firstName: 'Sam', weak: [{ front: 'Mitosis', lapses: 3 }] };

beforeEach(() => { mem.clear(); jest.clearAllMocks(); });

it('opens on the weakest card', async () => {
  const { result } = await renderHook(() => useLinneaChat({ ...base, stream: scripted() }));
  expect(result.current.messages).toEqual([
    expect.objectContaining({ role: 'linnea', state: 'done', text: 'Hey Sam. Mitosis keeps tripping you up. Want a three-minute fix?' }),
  ]);
});

it('streams a reply into one message', async () => {
  const { result } = await renderHook(() => useLinneaChat({ ...base, stream: scripted(() => say('Which', ' phase?')) }));
  await act(async () => { result.current.send('Quiz me'); });
  await waitFor(() => expect(result.current.streaming).toBe(false));
  const [, user, reply] = result.current.messages;
  expect(user).toMatchObject({ role: 'user', text: 'Quiz me' });
  expect(reply).toMatchObject({ role: 'linnea', text: 'Which phase?', state: 'done' });
});

it('answers a rate limit in her own voice', async () => {
  const stream = scripted(async function* () { throw new LinneaError('rate_limited'); });
  const { result } = await renderHook(() => useLinneaChat({ ...base, stream }));
  await act(async () => { result.current.send('Quiz me'); });
  await waitFor(() => expect(result.current.streaming).toBe(false));
  expect(result.current.messages.at(-1)).toMatchObject({ state: 'error', errorKind: 'rate_limited', text: linneaErrorLine('rate_limited') });
});

it('keeps the partial answer when the connection drops mid-reply', async () => {
  const stream = scripted(async function* () { yield 'Metaphase lines'; throw new LinneaError('network'); });
  const { result } = await renderHook(() => useLinneaChat({ ...base, stream }));
  await act(async () => { result.current.send('Quiz me'); });
  await waitFor(() => expect(result.current.streaming).toBe(false));
  const tail = result.current.messages.slice(-2);
  expect(tail[0]).toMatchObject({ role: 'linnea', text: 'Metaphase lines', state: 'done' });
  expect(tail[1]).toMatchObject({ role: 'linnea', state: 'error', text: linneaErrorLine('network') });
});

it('closes quietly when the sheet is dismissed mid-reply', async () => {
  const stream = scripted(async function* (signal) {
    yield 'Half';
    await new Promise((r) => setTimeout(r, 20));
    if (signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    yield ' more';
  });
  const { result, unmount } = await renderHook(() => useLinneaChat({ ...base, stream }));
  await act(async () => { result.current.send('Explain it simply'); });
  await unmount();
  await new Promise((r) => setTimeout(r, 40));
  const saved = kvGet<{ text: string; state: string }[]>('linnea.thread.u1') ?? [];
  expect(saved.some((m) => m.state === 'error')).toBe(false);
});

it('restores the conversation on reopen', async () => {
  const first = await renderHook(() => useLinneaChat({ ...base, stream: scripted(() => say('Metaphase')) }));
  await act(async () => { first.result.current.send('Quiz me'); });
  await waitFor(() => expect(first.result.current.streaming).toBe(false));
  await first.unmount();
  expect(kvSet).toHaveBeenCalled();
  const again = await renderHook(() => useLinneaChat({ ...base, stream: scripted() }));
  expect(again.result.current.messages.map((m) => m.text)).toContain('Metaphase');
});
