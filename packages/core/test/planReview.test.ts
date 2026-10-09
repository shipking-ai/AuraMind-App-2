import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Rating, calculateSRS, msToIso, planReview, toCardScheduleRow, type Card } from '../src';

const T = Date.UTC(2026, 9, 8, 12, 0, 0);
const newCard: Card = { id: 'c1', deckId: 'd1', front: 'Metaphase?', back: 'Chromosomes align' };

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T); });
afterEach(() => vi.useRealTimers());

it('turns a rating into the card update the website writes', () => {
  const { update, record } = planReview(newCard, Rating.GOOD, T);
  const expected = calculateSRS(newCard, Rating.GOOD);
  expect(update.interval).toBe(expected.interval);
  expect(update.repetition).toBe(expected.repetition);
  expect(update.easeFactor).toBe(expected.easeFactor);
  expect(update.fsrsState).toEqual(expected.fsrsState);
  expect(update.nextReview).toBe(T + update.interval * 86_400_000);
  expect(update.lastReviewed).toBe(T);
  expect(record).toEqual({ cardId: 'c1', rating: Rating.GOOD, reviewedAt: T, srsResult: expected });
});

it('maps the update to snake_case columns with ISO timestamps', () => {
  const { update } = planReview(newCard, Rating.GOOD, T);
  const row = toCardScheduleRow(update);
  expect(row).toEqual({
    interval: update.interval,
    repetition: update.repetition,
    ease_factor: update.easeFactor,
    next_review: msToIso(T + update.interval * 86_400_000),
    last_reviewed: msToIso(T),
    fsrs_state: update.fsrsState,
  });
});

it('omits fsrs_state when the update has none', () => {
  const row = toCardScheduleRow({ interval: 1, repetition: 1, easeFactor: 2.5, nextReview: T, lastReviewed: T });
  expect('fsrs_state' in row).toBe(false);
});
