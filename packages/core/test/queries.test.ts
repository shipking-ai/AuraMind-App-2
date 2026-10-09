import { expect, it } from 'vitest';
import { describe } from 'vitest';
import { PausedSyncError, PermanentSyncError, Rating, createBonaMindData, planReview, type Card } from '../src';
import { fakeSupabase, op } from './fakeSupabase';

const T = Date.UTC(2026, 9, 8, 12, 0, 0);
const ISO = '2026-10-08T12:00:00.000Z';
const card: Card = { id: 'c1', deckId: 'd1', front: 'F', back: 'B' };

it('pushReview logs the review, then updates the card only if the server is not newer', async () => {
  const { client, calls } = fakeSupabase();
  const { update, record } = planReview(card, Rating.GOOD, T);
  await createBonaMindData(client).pushReview('u1', record, update);
  expect(calls[0]).toMatchObject({ rpc: 'record_card_review' });
  expect(calls[0].args).toMatchObject({ p_user_id: 'u1', p_card_id: 'c1', p_rating: 4, p_srs_algorithm: 'fsrs', p_reviewed_at: ISO });
  expect(calls[1].table).toBe('cards');
  expect(op(calls[1], 'update')?.[0]).toMatchObject({ last_reviewed: ISO, interval: update.interval });
  expect(op(calls[1], 'eq')).toEqual(['id', 'c1']);
  expect(op(calls[1], 'or')).toEqual([`last_reviewed.is.null,last_reviewed.lt.${ISO}`]);
});

it('treats a missing card as permanent and skips the update', async () => {
  const { client, calls } = fakeSupabase({ rpc: { record_card_review: { error: { code: 'P0002', message: 'card not found' } } } });
  const { update, record } = planReview(card, Rating.GOOD, T);
  const err = await createBonaMindData(client).pushReview('u1', record, update).catch((e) => e);
  expect(err).toBeInstanceOf(PermanentSyncError);
  expect(err.code).toBe('P0002');
  expect(calls.some((c) => c.table === 'cards')).toBe(false);
});

it('rethrows transient errors as plain errors', async () => {
  const { client } = fakeSupabase({ rpc: { record_card_review: { error: { code: '08006', message: 'connection failure' } } } });
  const { update, record } = planReview(card, Rating.GOOD, T);
  const err = await createBonaMindData(client).pushReview('u1', record, update).catch((e) => e);
  expect(err).toBeInstanceOf(Error);
  expect(err).not.toBeInstanceOf(PermanentSyncError);
});

it('pushStudySession upserts idempotently by id', async () => {
  const { client, calls } = fakeSupabase();
  await createBonaMindData(client).pushStudySession('u1', {
    id: 's1', deckId: 'd1', startTime: T, endTime: T + 60_000, cardsStudied: 5, correctAnswers: 4, totalAnswers: 5, accuracy: 80, duration: 60_000,
  });
  expect(calls[0].table).toBe('study_sessions');
  const [row, opts] = op(calls[0], 'upsert')!;
  expect(row).toMatchObject({ id: 's1', user_id: 'u1', deck_id: 'd1', started_at: ISO, cards_studied: 5, duration_ms: 60_000 });
  expect(opts).toEqual({ onConflict: 'id', ignoreDuplicates: true });
});

it('listDecks attaches card counts', async () => {
  const { client } = fakeSupabase({
    tables: {
      decks: { data: [{ id: 'd1', name: 'Cell biology', created_at: ISO }, { id: 'd2', name: 'Spanish', created_at: ISO }] },
      cards: { data: [{ deck_id: 'd1' }, { deck_id: 'd1' }, { deck_id: 'd2' }] },
    },
  });
  const decks = await createBonaMindData(client).listDecks('u1');
  expect(decks.map((d) => [d.title, d.cardCount])).toEqual([['Cell biology', 2], ['Spanish', 1]]);
});

describe('sync error classification', () => {
  const push = (error: object) => {
    const { client } = fakeSupabase({ rpc: { record_card_review: { error } } });
    const { update, record } = planReview(card, Rating.GOOD, T);
    return createBonaMindData(client).pushReview('u1', record, update).catch((e) => e);
  };
  it('pauses on a network failure (no error code)', async () => {
    const e = await push({ code: '', message: 'TypeError: Network request failed' });
    expect(e).toBeInstanceOf(PausedSyncError);
    expect(e.reason).toBe('offline');
  });
  it('pauses when the request went out without a session', async () => {
    expect((await push({ code: '42501', message: 'permission denied for function record_card_review' })).reason).toBe('auth');
    expect((await push({ code: 'PGRST301', message: 'JWT expired' })).reason).toBe('auth');
  });
  it('is permanent when the RPC itself refuses the card', async () => {
    expect(await push({ code: '42501', message: 'record_card_review: card does not belong to caller' })).toBeInstanceOf(PermanentSyncError);
  });
  it.each(['23503', '23502', '22P02'])('treats %s as permanent', async (code) => {
    expect(await push({ code, message: 'constraint' })).toBeInstanceOf(PermanentSyncError);
  });
});

it('reads the stored fitted weights once the tuning gate is reached', async () => {
  const weights = Array.from({ length: 21 }, (_, i) => i / 10);
  const tuned = fakeSupabase({ tables: { user_fsrs_params: { data: { weights, profile_label: 'fast-learner', review_count: 120 } } } });
  expect(await createBonaMindData(tuned.client).getFsrsProfile('u1')).toEqual({ weights, profileLabel: 'fast-learner' });
  const young = fakeSupabase({ tables: { user_fsrs_params: { data: { weights, profile_label: 'x', review_count: 10 } } } });
  expect(await createBonaMindData(young.client).getFsrsProfile('u1')).toEqual({ weights: undefined, profileLabel: null });
});
