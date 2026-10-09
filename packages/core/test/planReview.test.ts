import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_TARGET_RETENTION, FSRS_PARAMETERS, Rating, applyPersonalizedDifficultyInit, calculateSRS, msToIso, planReview, toCardScheduleRow, type Card } from '../src';

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

it('schedules exactly like the website study screen with fitted weights and 85% retention', () => {
  const weights = [...FSRS_PARAMETERS].map((w, i) => (i === 2 ? w * 1.3 : w));
  const opts = { weightsOverride: weights, retention: DEFAULT_TARGET_RETENTION, profileLabel: 'tough-learner' };
  const { update } = planReview(newCard, Rating.GOOD, T, opts);
  // StudyModePage.handleRate: bias the first review, then calculateSRS(card, rating, weights, retention).
  const biased = applyPersonalizedDifficultyInit(newCard, 'tough-learner', weights);
  const web = calculateSRS(biased.card, Rating.GOOD, weights, 0.85);
  expect(DEFAULT_TARGET_RETENTION).toBe(0.85);
  expect(update.interval).toBe(web.interval);
  expect(update.fsrsState).toEqual(web.fsrsState);
  expect(update.interval).not.toBe(planReview(newCard, Rating.GOOD, T).update.interval);
});
