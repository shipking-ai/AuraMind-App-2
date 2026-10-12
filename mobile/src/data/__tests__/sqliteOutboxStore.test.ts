import { PermanentSyncError, Rating, createOutbox, planReview, type Card } from '@bonamind/core';
import { migrate, type BonaDb } from '../db';
import { createSqliteOutboxStore } from '../sqliteOutboxStore';

// A real SQLite engine (Node's built-in) behind expo-sqlite's async API shape.
function nodeDb(): BonaDb {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(':memory:');
  return {
    execAsync: async (sql: string) => { db.exec(sql); },
    runAsync: async (sql: string, params: unknown[] = []) => { db.prepare(sql).run(...params); },
    getAllAsync: async (sql: string, params: unknown[] = []) => db.prepare(sql).all(...params),
    getFirstAsync: async (sql: string, params: unknown[] = []) => db.prepare(sql).get(...params) ?? null,
  } as BonaDb;
}

const T = Date.UTC(2026, 9, 8, 12, 0, 0);
const card = (id: string): Card => ({ id, deckId: 'd1', front: id, back: id });

async function setup(push: jest.Mock = jest.fn(async () => {})) {
  const db = nodeDb();
  await migrate(db);
  const store = createSqliteOutboxStore(db);
  let n = 0;
  const outbox = createOutbox({ store, now: () => T, newId: () => `id${++n}`, data: { pushReview: push, pushStudySession: jest.fn(async () => {}) } });
  return { db, store, outbox, push };
}

it('replays in reviewedAt order from SQLite', async () => {
  const { outbox, push } = await setup();
  for (const [id, dt] of [['late', 1], ['early', 2]] as const) {
    const p = planReview(card(id), Rating.GOOD, T - dt * 1000);
    await outbox.enqueueReview('u1', p.record, p.update);
  }
  expect(await outbox.flush('u1')).toEqual({ sent: 2, dead: 0, stoppedEarly: false });
  expect(push.mock.calls.map((c: any[]) => c[1].cardId)).toEqual(['early', 'late']);
});

it('persists attempts and dead-letters permanent failures', async () => {
  const push = jest.fn(async (_u: string, r: { cardId: string }) => {
    if (r.cardId === 'gone') throw new PermanentSyncError('P0002', 'gone');
    if (r.cardId === 'flaky') throw new Error('net');
  });
  const { outbox, store, db } = await setup(push);
  for (const [id, dt] of [['gone', 3], ['flaky', 2]] as const) {
    const p = planReview(card(id), Rating.GOOD, T - dt * 1000);
    await outbox.enqueueReview('u1', p.record, p.update);
  }
  expect(await outbox.flush('u1')).toEqual({ sent: 0, dead: 1, stoppedEarly: true });
  const [left] = await store.list('u1');
  expect(left.attempts).toBe(1);
  expect(await db.getAllAsync('SELECT reason FROM dead_letter', [])).toEqual([{ reason: 'permanent:P0002' }]);
});

it('drops another account’s queue on sign-in', async () => {
  const { outbox, store } = await setup();
  const p = planReview(card('c1'), Rating.GOOD, T - 1000);
  await outbox.enqueueReview('u1', p.record, p.update);
  expect(await store.clearOtherUsers('u2')).toBe(1);
  expect(await outbox.pending('u1')).toBe(0);
});
