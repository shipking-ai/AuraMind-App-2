import { describe, expect, it, vi } from 'vitest';
import {
  MAX_ATTEMPTS, PermanentSyncError, Rating, createMemoryOutboxStore, createOutbox, planReview,
  type Card, type OutboxStore,
} from '../src';

const T = Date.UTC(2026, 9, 8, 12, 0, 0);
const card = (id: string): Card => ({ id, deckId: 'd1', front: id, back: id });
const plan = (id: string, at: number) => planReview(card(id), Rating.GOOD, at);

function setup(push = vi.fn(async () => {}), store: OutboxStore = createMemoryOutboxStore()) {
  let n = 0;
  const outbox = createOutbox({
    store,
    data: { pushReview: push, pushStudySession: vi.fn(async () => {}) },
    now: () => T,
    newId: () => `id${++n}`,
  });
  return { outbox, push, store };
}

describe('outbox', () => {
  it('flushes in reviewedAt order', async () => {
    const { outbox, push } = setup();
    const late = plan('late', T - 1_000);
    const early = plan('early', T - 2_000);
    await outbox.enqueueReview('u1', late.record, late.update);
    await outbox.enqueueReview('u1', early.record, early.update);
    expect(await outbox.flush('u1')).toEqual({ sent: 2, dead: 0, stoppedEarly: false });
    expect(push.mock.calls.map((c: any[]) => c[1].cardId)).toEqual(['early', 'late']);
    expect(await outbox.pending('u1')).toBe(0);
  });

  it('replays the identical review after a lost response', async () => {
    const base = createMemoryOutboxStore();
    let failRemove = true;
    const store: OutboxStore = { ...base, remove: async (id) => { if (failRemove) { failRemove = false; throw new Error('lost'); } return base.remove(id); } };
    const { outbox, push } = setup(undefined, store);
    const p = plan('c1', T - 1_000);
    await outbox.enqueueReview('u1', p.record, p.update);
    expect((await outbox.flush('u1')).stoppedEarly).toBe(true);
    expect(await outbox.flush('u1')).toEqual({ sent: 1, dead: 0, stoppedEarly: false });
    expect(push).toHaveBeenCalledTimes(2);
    expect(push.mock.calls[0][1].reviewedAt).toBe(push.mock.calls[1][1].reviewedAt);
  });

  it('stops at a transient failure to keep order', async () => {
    const push = vi.fn(async (_u: string, r: { cardId: string }) => { if (r.cardId === 'b') throw new Error('net'); });
    const { outbox, store } = setup(push);
    for (const [id, dt] of [['a', 3], ['b', 2], ['c', 1]] as const) {
      const p = plan(id, T - dt * 1_000);
      await outbox.enqueueReview('u1', p.record, p.update);
    }
    expect(await outbox.flush('u1')).toEqual({ sent: 1, dead: 0, stoppedEarly: true });
    expect(push.mock.calls.map((c: any[]) => c[1].cardId)).toEqual(['a', 'b']);
    const left = await store.list('u1');
    expect(left.map((i) => [i.kind === 'review' && i.record.cardId, i.attempts])).toEqual([['b', 1], ['c', 0]]);
  });

  it(`dead-letters after ${MAX_ATTEMPTS} attempts`, async () => {
    const onDeadLetter = vi.fn();
    const store = createMemoryOutboxStore();
    const outbox = createOutbox({
      store, onDeadLetter, now: () => T,
      data: { pushReview: vi.fn(async () => { throw new Error('net'); }), pushStudySession: vi.fn() },
    });
    const p = plan('c1', T - 1_000);
    await outbox.enqueueReview('u1', p.record, p.update);
    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) expect((await outbox.flush('u1')).stoppedEarly).toBe(true);
    expect(await outbox.flush('u1')).toEqual({ sent: 0, dead: 1, stoppedEarly: false });
    expect(onDeadLetter).toHaveBeenCalledTimes(1);
    expect(await outbox.pending('u1')).toBe(0);
  });

  it('dead-letters a permanent error at once and keeps flushing (deleted card)', async () => {
    const push = vi.fn(async (_u: string, r: { cardId: string }) => {
      if (r.cardId === 'gone') throw new PermanentSyncError('P0002', 'card not found');
    });
    const { outbox } = setup(push);
    const gone = plan('gone', T - 2_000);
    const ok = plan('ok', T - 1_000);
    await outbox.enqueueReview('u1', gone.record, gone.update);
    await outbox.enqueueReview('u1', ok.record, ok.update);
    expect(await outbox.flush('u1')).toEqual({ sent: 1, dead: 1, stoppedEarly: false });
  });

  it('clamps a review stamped in the future to now', async () => {
    const { outbox, store } = setup();
    const p = plan('c1', T + 10 * 60_000);
    await outbox.enqueueReview('u1', p.record, p.update);
    const [item] = await store.list('u1');
    expect(item.reviewedAt).toBe(T);
    if (item.kind !== 'review') throw new Error('expected a review');
    expect(item.record.reviewedAt).toBe(T);
    expect(item.update.lastReviewed).toBe(T);
    expect(item.update.nextReview).toBe(T + item.update.interval * 86_400_000);
  });

  it('keeps a review only for the user who made it', async () => {
    const { outbox } = setup();
    const p = plan('c1', T - 1_000);
    await outbox.enqueueReview('u1', p.record, p.update);
    expect(await outbox.adoptUser('u2')).toBe(1);
    expect(await outbox.pending('u1')).toBe(0);
    expect(await outbox.pending('u2')).toBe(0);
  });

  it('queues study sessions in the same ordered stream', async () => {
    const pushStudySession = vi.fn(async () => {});
    const outbox = createOutbox({ store: createMemoryOutboxStore(), now: () => T, data: { pushReview: vi.fn(async () => {}), pushStudySession } });
    await outbox.enqueueSession('u1', { id: 's1', deckId: 'd1', startTime: T - 60_000, endTime: T, cardsStudied: 1 });
    expect(await outbox.flush('u1')).toEqual({ sent: 1, dead: 0, stoppedEarly: false });
    expect(pushStudySession).toHaveBeenCalledWith('u1', expect.objectContaining({ id: 's1' }));
  });
});
