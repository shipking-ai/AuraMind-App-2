import NetInfo from '@react-native-community/netinfo';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import type { Outbox } from '@bonamind/core';

type OutboxPort = Pick<Outbox, 'flush' | 'adoptUser' | 'pending'>;
interface NetPort { addEventListener(l: (s: { isConnected: boolean | null }) => void): () => void }
interface AppPort { addEventListener(e: 'change', l: (s: string) => void): { remove(): void } }

export interface SyncState { online: boolean; pending: number }

const ENQUEUE_DEBOUNCE_MS = 300;

/**
 * Decides when the outbox flushes: when the connection returns, when the app
 * comes to the foreground, and shortly after each new write. Only for the
 * signed-in user, whose queue it adopts on sign-in.
 */
export function createSyncEngine(deps: { outbox: OutboxPort; netinfo: NetPort; appState: AppPort }) {
  let userId: string | null = null;
  let state: SyncState = { online: true, pending: 0 };
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();
  const emit = (next: Partial<SyncState>) => {
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  };

  let afterFlush: (() => void) | null = null;

  async function flushNow(): Promise<void> {
    if (!userId || !state.online) return;
    const uid = userId;
    const result = await deps.outbox.flush(uid);
    if (result.sent > 0) afterFlush?.();
    if (uid === userId) emit({ pending: await deps.outbox.pending(uid) });
  }

  deps.netinfo.addEventListener(({ isConnected }) => {
    const online = isConnected !== false;
    const cameBack = online && !state.online;
    if (online !== state.online) emit({ online });
    if (cameBack) void flushNow();
  });
  deps.appState.addEventListener('change', (s) => {
    if (s === 'active') void flushNow();
  });

  return {
    getState: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    async setUser(next: string | null) {
      if (next === userId) return;
      userId = next;
      if (!next) return emit({ pending: 0 });
      await deps.outbox.adoptUser(next);
      await flushNow();
    },
    flushNow,
    /** Refresh server data once queued writes have landed. */
    onFlushed(fn: () => void) { afterFlush = fn; },
    /** Call after each enqueue; coalesces a burst of ratings into one flush. */
    notifyEnqueued() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; void flushNow(); }, ENQUEUE_DEBOUNCE_MS);
      if (userId) void deps.outbox.pending(userId).then((pending) => emit({ pending }));
    },
  };
}

export type SyncEngine = ReturnType<typeof createSyncEngine>;

let engine: SyncEngine | null = null;

export function startSync(outbox: OutboxPort): SyncEngine {
  engine ??= createSyncEngine({ outbox, netinfo: NetInfo, appState: AppState });
  return engine;
}

export function getSyncEngine(): SyncEngine {
  if (!engine) throw new Error('startSync() must run before the sync engine is used');
  return engine;
}

/** Live { online, pending } plus flushNow, and keeps the engine on the signed-in user. */
export function useSync(userId: string | null) {
  const e = getSyncEngine();
  const s = useSyncExternalStore(e.subscribe, e.getState);
  useEffect(() => { void e.setUser(userId); }, [e, userId]);
  return { ...s, flushNow: e.flushNow };
}
