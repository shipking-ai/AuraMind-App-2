import { describe, expect, it } from 'vitest';
import { LinneaError, streamLinnea } from '../src';

const enc = new TextEncoder();
function sse(chunks: string[], status = 200) {
  const sent: { url: string; init: any }[] = [];
  const fetchImpl = async (url: string, init: any) => {
    sent.push({ url, init });
    if (init.signal?.aborted) throw new DOMException('aborted', 'AbortError');
    let i = 0;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => 'error body',
      body: { getReader: () => ({ read: async () => (i < chunks.length ? { done: false, value: enc.encode(chunks[i++]) } : { done: true }) }) },
    };
  };
  return { fetchImpl: fetchImpl as any, sent };
}
const delta = (t: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`;
const collect = async (g: AsyncGenerator<string>) => { const out: string[] = []; for await (const t of g) out.push(t); return out; };
const base = { apiBaseUrl: 'https://bonamind.app', token: 'tok', messages: [{ role: 'user' as const, content: 'Quiz me' }] };

describe('streamLinnea', () => {
  it('yields deltas, even when a chunk splits a line', async () => {
    const both = delta('Meta') + delta('phase');
    const { fetchImpl } = sse([both.slice(0, 20), both.slice(20)]);
    expect(await collect(streamLinnea({ ...base, fetchImpl }))).toEqual(['Meta', 'phase']);
  });

  it('stops at [DONE]', async () => {
    const { fetchImpl } = sse([delta('One'), 'data: [DONE]\n\n', delta('ignored')]);
    expect(await collect(streamLinnea({ ...base, fetchImpl }))).toEqual(['One']);
  });

  it('sends the proxy request without a model', async () => {
    const { fetchImpl, sent } = sse(['data: [DONE]\n\n']);
    await collect(streamLinnea({ ...base, fetchImpl }));
    expect(sent[0].url).toBe('https://bonamind.app/api/ai/chat/stream');
    expect(sent[0].init.method).toBe('POST');
    expect(sent[0].init.headers).toEqual({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
    expect(JSON.parse(sent[0].init.body)).toEqual({ messages: base.messages, temperature: 0.7, max_tokens: 1200, stream: true });
  });

  it.each([[429, 'rate_limited'], [503, 'unavailable'], [401, 'auth'], [403, 'auth'], [500, 'busy']])('maps HTTP %i to %s', async (status, kind) => {
    const { fetchImpl } = sse([], status);
    const err = await collect(streamLinnea({ ...base, fetchImpl })).catch((e) => e);
    expect(err).toBeInstanceOf(LinneaError);
    expect(err.kind).toBe(kind);
  });

  it('maps a failed request to network', async () => {
    const fetchImpl = (async () => { throw new TypeError('Network request failed'); }) as any;
    const err = await collect(streamLinnea({ ...base, fetchImpl })).catch((e) => e);
    expect(err.kind).toBe('network');
  });

  it('lets an abort through untouched', async () => {
    const { fetchImpl } = sse([delta('x')]);
    const ctrl = new AbortController();
    ctrl.abort();
    const err = await collect(streamLinnea({ ...base, fetchImpl, signal: ctrl.signal })).catch((e) => e);
    expect(err).not.toBeInstanceOf(LinneaError);
    expect(err.name).toBe('AbortError');
  });

  it('decodes multi-byte characters split across chunks', async () => {
    const bytes = enc.encode(delta('naïve ✓'));
    let i = 0;
    const parts = [bytes.slice(0, 40), bytes.slice(40)];
    const fetchImpl = (async () => ({ ok: true, status: 200, text: async () => '', body: { getReader: () => ({ read: async () => (i < 2 ? { done: false, value: parts[i++] } : { done: true }) }) } })) as any;
    expect((await collect(streamLinnea({ ...base, fetchImpl }))).join('')).toBe('naïve ✓');
  });
});
