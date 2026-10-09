/**
 * The offline write queue. Reviews and study sessions are recorded locally
 * first and replayed to Supabase in the order they happened.
 *
 * Replays are safe: the review RPC is idempotent on (user, card, reviewedAt)
 * and sessions upsert by id, so an item re-sent after a lost response is a
 * no-op on the server. A transient failure stops the flush so order holds;
 * a permanent one (card deleted, not the owner) is set aside at once.
 */
import type { BonaMindData, NewStudySession } from '../data/queries';
import { PermanentSyncError } from '../data/queries';
import type { CardScheduleUpdate, ReviewRecord } from '../review/planReview';

export const MAX_ATTEMPTS = 5;
/** A device clock further ahead than this would block newer server reviews. */
export const MAX_FUTURE_SKEW_MS = 5 * 60_000;

const DAY_MS = 86_400_000;

type Base = { id: string; userId: string; reviewedAt: number; attempts: number };
export type OutboxItem =
  | (Base & { kind: 'review'; record: ReviewRecord; update: CardScheduleUpdate })
  | (Base & { kind: 'session'; session: NewStudySession });

export interface OutboxStore {
  add(item: OutboxItem): Promise<void>;
  /** Ordered by reviewedAt ascending, then id. */
  list(userId: string): Promise<OutboxItem[]>;
  update(item: OutboxItem): Promise<void>;
  remove(id: string): Promise<void>;
  moveToDeadLetter(item: OutboxItem, reason: string): Promise<void>;
  clearOtherUsers(userId: string): Promise<number>;
}

export function sortOutbox(items: OutboxItem[]): OutboxItem[] {
  return [...items].sort((a, b) => a.reviewedAt - b.reviewedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Items are plain JSON; a copy keeps callers from mutating stored state. */
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function createMemoryOutboxStore(): OutboxStore & { deadLetters: { item: OutboxItem; reason: string }[] } {
  const items = new Map<string, OutboxItem>();
  const deadLetters: { item: OutboxItem; reason: string }[] = [];
  return {
    deadLetters,
    async add(item) { items.set(item.id, clone(item)); },
    async list(userId) { return sortOutbox([...items.values()].filter((i) => i.userId === userId)).map((i) => clone(i)); },
    async update(item) { items.set(item.id, clone(item)); },
    async remove(id) { items.delete(id); },
    async moveToDeadLetter(item, reason) { items.delete(item.id); deadLetters.push({ item, reason }); },
    async clearOtherUsers(userId) {
      let n = 0;
      for (const [id, i] of items) if (i.userId !== userId) { items.delete(id); n++; }
      return n;
    },
  };
}

function randomId(): string {
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) =>
    c === 'x' ? hex() : ((Math.random() * 4) | 8).toString(16),
  );
}

export interface FlushResult { sent: number; dead: number; stoppedEarly: boolean }

export function createOutbox(deps: {
  store: OutboxStore;
  data: Pick<BonaMindData, 'pushReview' | 'pushStudySession'>;
  now?: () => number;
  newId?: () => string;
  onDeadLetter?: (item: OutboxItem, reason: string) => void;
}) {
  const { store, data } = deps;
  const now = deps.now ?? (() => Date.now());
  const newId = deps.newId ?? randomId;
  let running: Promise<FlushResult> | null = null;

  async function deadLetter(item: OutboxItem, reason: string) {
    await store.moveToDeadLetter(item, reason);
    deps.onDeadLetter?.(item, reason);
  }

  async function flushOnce(userId: string): Promise<FlushResult> {
    let sent = 0;
    let dead = 0;
    for (const item of await store.list(userId)) {
      try {
        if (item.kind === 'review') await data.pushReview(item.userId, item.record, item.update);
        else await data.pushStudySession(item.userId, item.session);
        await store.remove(item.id);
        sent++;
      } catch (e) {
        if (e instanceof PermanentSyncError) {
          await deadLetter(item, `permanent:${e.code}`);
          dead++;
          continue;
        }
        const next = { ...item, attempts: item.attempts + 1 };
        if (next.attempts >= MAX_ATTEMPTS) {
          await deadLetter(next, 'max-attempts');
          dead++;
          continue;
        }
        await store.update(next);
        return { sent, dead, stoppedEarly: true };
      }
    }
    return { sent, dead, stoppedEarly: false };
  }

  return {
    async enqueueReview(userId: string, record: ReviewRecord, update: CardScheduleUpdate): Promise<void> {
      const t = now();
      let rec = record;
      let upd = update;
      if (record.reviewedAt > t + MAX_FUTURE_SKEW_MS) {
        rec = { ...record, reviewedAt: t };
        upd = { ...update, lastReviewed: t, nextReview: t + update.interval * DAY_MS };
      }
      await store.add({ id: newId(), userId, kind: 'review', reviewedAt: rec.reviewedAt, attempts: 0, record: rec, update: upd });
    },

    async enqueueSession(userId: string, session: NewStudySession): Promise<void> {
      const at = Math.min(session.endTime ?? session.startTime, now() + MAX_FUTURE_SKEW_MS);
      await store.add({ id: newId(), userId, kind: 'session', reviewedAt: at, attempts: 0, session });
    },

    /** One flush at a time; a concurrent call shares the running one. */
    flush(userId: string): Promise<FlushResult> {
      if (!running) running = flushOnce(userId).finally(() => { running = null; });
      return running;
    },

    async pending(userId: string): Promise<number> {
      return (await store.list(userId)).length;
    },

    /** On sign-in: queued writes belong to the account that made them. */
    adoptUser(userId: string): Promise<number> {
      return store.clearOtherUsers(userId);
    },
  };
}

export type Outbox = ReturnType<typeof createOutbox>;
