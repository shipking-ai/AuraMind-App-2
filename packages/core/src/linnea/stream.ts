/**
 * Streams Prof. Linnea's reply from the BonaMind API proxy
 * (POST /api/ai/chat/stream, OpenAI-style SSE deltas).
 *
 * Platform-free: fetch is injected (or taken from globalThis), and bytes are
 * decoded here because React Native's TextDecoder support varies.
 */
export type LinneaMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type LinneaErrorKind = 'busy' | 'rate_limited' | 'unavailable' | 'auth' | 'network' | 'subscription';

export class LinneaError extends Error {
  constructor(public kind: LinneaErrorKind, message?: string) {
    super(message ?? kind);
    this.name = 'LinneaError';
  }
}

interface ReaderLike { read(): Promise<{ done: boolean; value?: Uint8Array }> }
interface ResponseLike {
  ok: boolean;
  status: number;
  body: { getReader(): ReaderLike } | null;
  text(): Promise<string>;
}
interface SignalLike { aborted: boolean; reason?: unknown }
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string; signal?: SignalLike },
) => Promise<ResponseLike>;

function errorKind(status: number): LinneaErrorKind {
  if (status === 402) return 'subscription';
  if (status === 429) return 'rate_limited';
  if (status === 503) return 'unavailable';
  if (status === 401 || status === 403) return 'auth';
  return 'busy';
}

const isAbort = (e: unknown) => (e as { name?: string } | null)?.name === 'AbortError';

/** Incremental UTF-8 decoder: holds back an incomplete trailing sequence. */
function utf8Decoder() {
  let pending: number[] = [];
  return (bytes: Uint8Array): string => {
    const all = pending.concat(Array.from(bytes));
    let end = all.length;
    // Find where a trailing multi-byte sequence starts, if it is incomplete.
    for (let back = 1; back <= Math.min(3, all.length); back++) {
      const b = all[all.length - back];
      if ((b & 0xc0) === 0x80) continue; // continuation byte
      const need = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
      if (need > back) end = all.length - back;
      break;
    }
    pending = all.slice(end);
    let out = '';
    for (let i = 0; i < end; ) {
      const b = all[i];
      let cp: number;
      if (b < 0x80) { cp = b; i += 1; }
      else if (b < 0xe0) { cp = ((b & 0x1f) << 6) | (all[i + 1] & 0x3f); i += 2; }
      else if (b < 0xf0) { cp = ((b & 0x0f) << 12) | ((all[i + 1] & 0x3f) << 6) | (all[i + 2] & 0x3f); i += 3; }
      else { cp = ((b & 0x07) << 18) | ((all[i + 1] & 0x3f) << 12) | ((all[i + 2] & 0x3f) << 6) | (all[i + 3] & 0x3f); i += 4; }
      out += String.fromCodePoint(cp);
    }
    return out;
  };
}

/** Parses complete `data:` lines; returns content deltas and whether [DONE] was seen. */
function parseLines(lines: string[]): { deltas: string[]; done: boolean } {
  const deltas: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (payload === '[DONE]') return { deltas, done: true };
    try {
      const content = JSON.parse(payload)?.choices?.[0]?.delta?.content;
      if (typeof content === 'string' && content.length > 0) deltas.push(content);
    } catch {
      // A keep-alive or malformed line; skip it.
    }
  }
  return { deltas, done: false };
}

export async function* streamLinnea(opts: {
  apiBaseUrl: string;
  token: string;
  messages: LinneaMessage[];
  signal?: SignalLike;
  fetchImpl?: FetchLike;
}): AsyncGenerator<string> {
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((globalThis as any).fetch as FetchLike);
  let res: ResponseLike;
  try {
    res = await fetchImpl(`${opts.apiBaseUrl.replace(/\/+$/, '')}/api/ai/chat/stream`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${opts.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: opts.messages, temperature: 0.7, max_tokens: 1200, stream: true }),
      signal: opts.signal,
    });
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new LinneaError('network', (e as Error)?.message);
  }
  if (!res.ok) throw new LinneaError(errorKind(res.status), `HTTP ${res.status}`);

  try {
    if (!res.body) {
      // No streaming support: parse the whole reply at once.
      yield* parseLines((await res.text()).split('\n')).deltas;
      return;
    }
    const reader = res.body.getReader();
    const decode = utf8Decoder();
    let buffer = '';
    for (;;) {
      if (opts.signal?.aborted) throw opts.signal.reason ?? Object.assign(new Error('aborted'), { name: 'AbortError' });
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decode(value ?? new Uint8Array());
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      const parsed = parseLines(lines);
      yield* parsed.deltas;
      if (parsed.done) return;
    }
    yield* parseLines([buffer]).deltas;
  } catch (e) {
    if (isAbort(e) || e instanceof LinneaError) throw e;
    throw new LinneaError('network', (e as Error)?.message);
  }
}
