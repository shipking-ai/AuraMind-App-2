import { expect, it } from 'vitest';
import { createCourse, PROFILE_DIFFICULTY_CENTER, type DraftCard } from '../src';
import { fakeSupabase, op, type FakeCall } from './fakeSupabase';

const draft = (n: number) => ({
  title: 'Cells',
  description: 'd',
  cards: Array.from({ length: n }, (_, i): DraftCard => ({ front: `Q${i + 1}`, back: `A${i + 1}` })),
});
const insertedRows = (call: FakeCall) => (op(call, 'insert')?.[0] ?? []) as Record<string, unknown>[];
const isInsert = (call: FakeCall) => call.chain.some(([n]) => n === 'insert');
const isDelete = (call: FakeCall) => call.chain.some(([n]) => n === 'delete');

/** decks.insert(...).select().single() answers with the row; cards.insert(...).select() echoes rows with ids. */
function client(opts: { failCards?: boolean } = {}) {
  return fakeSupabase({
    tables: {
      decks: (call) => (isInsert(call)
        ? { data: { id: 'deck-1', name: 'Cells', description: 'd', created_at: '2026-10-12T00:00:00.000Z' } }
        : { data: null }),
      cards: (call) => (opts.failCards
        ? { error: { code: '23514', message: 'check failed' } }
        : { data: insertedRows(call).map((r, i) => ({ ...r, id: `card-${i + 1}` })) }),
    },
  });
}

it('inserts the deck then all cards with initial FSRS state', async () => {
  const { client: c, calls } = client();
  const { deck, cards } = await createCourse(c, 'u1', draft(3), { profileLabel: null });
  const deckCall = calls.find((x) => x.table === 'decks')!;
  expect(op(deckCall, 'insert')?.[0]).toMatchObject({ user_id: 'u1', name: 'Cells', description: 'd' });
  const cardCall = calls.find((x) => x.table === 'cards')!;
  const rows = insertedRows(cardCall);
  expect(rows).toHaveLength(3);
  expect(rows[0]).toMatchObject({ user_id: 'u1', deck_id: 'deck-1', front: 'Q1', back: 'A1', fsrs_state: expect.any(String) });
  expect(calls.filter((x) => x.table === 'cards')).toHaveLength(1); // one batch insert
  expect(deck).toMatchObject({ id: 'deck-1', title: 'Cells', cardCount: 3 });
  expect(cards.map((x) => x.id)).toEqual(['card-1', 'card-2', 'card-3']);
});

it('applies personalized difficulty when a profile is known', async () => {
  const plain = client();
  await createCourse(plain.client, 'u1', draft(1), { profileLabel: null });
  const tuned = client();
  await createCourse(tuned.client, 'u1', draft(1), { profileLabel: 'fast-learner' });
  const difficulty = (calls: FakeCall[]) => JSON.parse(insertedRows(calls.find((x) => x.table === 'cards')!)[0].fsrs_state as string).difficulty;
  expect(difficulty(tuned.calls)).toBe(PROFILE_DIFFICULTY_CENTER['fast-learner']);
  expect(difficulty(plain.calls)).not.toBe(PROFILE_DIFFICULTY_CENTER['fast-learner']);
});

it('deletes the deck when the card insert fails', async () => {
  const { client: c, calls } = client({ failCards: true });
  await expect(createCourse(c, 'u1', draft(3), { profileLabel: null })).rejects.toBeTruthy();
  const del = calls.find((x) => x.table === 'decks' && isDelete(x));
  expect(del).toBeTruthy();
  expect(op(del!, 'eq')).toEqual(['id', 'deck-1']);
});
