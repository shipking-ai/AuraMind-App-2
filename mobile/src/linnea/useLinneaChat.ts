import {
  LINNEA_SYSTEM_PROMPT, LinneaError, linneaErrorLine, linneaOpening, streamLinnea,
  type Card, type FetchLike, type LinneaErrorKind, type LinneaMessage,
} from '@bonamind/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { kvGet, kvSet } from '../data/db';
import { env } from '../env';

export interface ChatItem {
  id: string;
  role: 'user' | 'linnea';
  text: string;
  state: 'streaming' | 'done' | 'error';
  errorKind?: LinneaErrorKind;
}

export type StreamFn = (opts: { messages: LinneaMessage[]; signal?: AbortSignal }) => AsyncGenerator<string>;

const isAbort = (e: unknown) => (e as { name?: string } | null)?.name === 'AbortError';
const threadKey = (userId: string) => `linnea.thread.${userId}`;
let seq = 0;
const nextId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Streaming via expo/fetch, which exposes the response body as a stream on device. */
function defaultStream(token: string): StreamFn {
  return ({ messages, signal }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { fetch } = require('expo/fetch') as { fetch: FetchLike };
    return streamLinnea({ apiBaseUrl: env.apiBaseUrl, token, messages, signal, fetchImpl: fetch });
  };
}

function toApi(items: ChatItem[]): LinneaMessage[] {
  return [
    { role: 'system', content: LINNEA_SYSTEM_PROMPT },
    ...items
      .filter((m) => m.state !== 'error' && m.text.trim())
      .map((m): LinneaMessage => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
  ];
}

/**
 * Prof. Linnea's conversation: seeded with an opening about the student's
 * weakest card, streamed token by token, persisted on the device, and
 * cancelled (silently) when the sheet closes.
 */
export function useLinneaChat(opts: {
  userId: string;
  token: string;
  firstName?: string | null;
  weak: Pick<Card, 'front' | 'lapses'>[];
  stream?: StreamFn;
}) {
  const { userId, token, firstName, weak } = opts;
  const [messages, setMessages] = useState<ChatItem[]>(
    () => kvGet<ChatItem[]>(threadKey(userId)) ?? [{ id: nextId(), role: 'linnea', text: linneaOpening(weak, firstName), state: 'done' }],
  );
  const [streaming, setStreaming] = useState(false);
  const live = useRef<AbortController | null>(null);
  const latest = useRef(messages);
  const streamRef = useRef<StreamFn>(opts.stream ?? defaultStream(token));

  const commit = useCallback((next: ChatItem[]) => {
    latest.current = next;
    setMessages(next);
    void kvSet(threadKey(userId), next.filter((m) => m.state !== 'streaming'));
  }, [userId]);

  useEffect(() => () => live.current?.abort(), []);

  const run = useCallback(async (history: ChatItem[]) => {
    const ctrl = new AbortController();
    live.current = ctrl;
    const reply: ChatItem = { id: nextId(), role: 'linnea', text: '', state: 'streaming' };
    let current = [...history, reply];
    commit(current);
    setStreaming(true);
    const update = (patch: Partial<ChatItem>, extra: ChatItem[] = []) => {
      Object.assign(reply, patch);
      current = [...current.filter((m) => m.id !== reply.id), { ...reply }, ...extra];
      commit(current);
    };
    try {
      for await (const token of streamRef.current({ messages: toApi(history), signal: ctrl.signal })) {
        if (ctrl.signal.aborted) break;
        update({ text: reply.text + token });
      }
      if (!ctrl.signal.aborted) update({ state: 'done' });
    } catch (e) {
      if (isAbort(e) || ctrl.signal.aborted) {
        // The sheet closed: keep whatever arrived, add no error line.
        if (reply.text) update({ state: 'done' });
        else commit(current.filter((m) => m.id !== reply.id));
      } else {
        const kind: LinneaErrorKind = e instanceof LinneaError ? e.kind : 'network';
        const errorItem: ChatItem = { id: nextId(), role: 'linnea', text: linneaErrorLine(kind), state: 'error', errorKind: kind };
        if (reply.text) update({ state: 'done' }, [errorItem]);
        else commit([...current.filter((m) => m.id !== reply.id), errorItem]);
      }
    } finally {
      if (live.current === ctrl) live.current = null;
      setStreaming(false);
    }
  }, [commit]);

  const send = useCallback((text: string) => {
    const t = text.trim();
    if (!t || live.current) return;
    void run([...latest.current, { id: nextId(), role: 'user', text: t, state: 'done' }]);
  }, [run]);

  const retry = useCallback(() => {
    if (live.current) return;
    // Re-ask the last question, dropping any partial or error reply to it.
    const all = latest.current;
    const lastUser = all.map((m) => m.role).lastIndexOf('user');
    if (lastUser >= 0) void run(all.slice(0, lastUser + 1));
  }, [run]);

  return { messages, send, retry, streaming };
}
