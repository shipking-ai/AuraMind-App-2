import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateCard = vi.hoisted(() => vi.fn());
const recordReview = vi.hoisted(() => vi.fn());
const queueCardReview = vi.hoisted(() => vi.fn());
const online = vi.hoisted(() => ({ value: true }));
vi.mock('../services/database/dbService', () => ({ dbService: { updateCard: (...a: unknown[]) => updateCard(...a) } }));
vi.mock('../services/database/modules/cardReviewsService', () => ({ cardReviewsService: { recordReview: (...a: unknown[]) => recordReview(...a) } }));
vi.mock('../services/offline/offlineStudyService', () => ({
  isOnline: () => online.value,
  queueCardReview: (...a: unknown[]) => queueCardReview(...a),
}));
vi.mock('../services/analytics/analyticsService', () => ({ analyticsService: { track: vi.fn() } }));

import { rateCard } from '../services/study/rateCard';
import { Rating, type Card } from '../types';

const card = { id: 'c1', deckId: 'd1', front: 'la madrugada', back: 'early morning', interval: 0, repetition: 0, easeFactor: 2.5 } as Card;

beforeEach(() => {
  online.value = true;
  updateCard.mockReset().mockResolvedValue(card);
  recordReview.mockReset().mockResolvedValue(undefined);
  queueCardReview.mockReset().mockResolvedValue(undefined);
});

describe('rateCard', () => {
  it('writes the schedule, including the new FSRS state, and records the review', async () => {
    const update = await rateCard({ card, rating: Rating.GOOD, userId: 'u1', surface: 'quick-review' });
    expect(update.fsrsState).toBeDefined();
    expect(update.nextReview).toBeGreaterThan(Date.now());
    expect(updateCard).toHaveBeenCalledWith('c1', update);
    expect(recordReview).toHaveBeenCalledWith(expect.objectContaining({ userId: 'u1', cardId: 'c1', rating: Rating.GOOD }));
    expect(queueCardReview).not.toHaveBeenCalled();
  });

  it('queues the review first when offline', async () => {
    online.value = false;
    await rateCard({ card, rating: Rating.AGAIN, userId: 'u1', surface: 'quick-review' });
    expect(queueCardReview).toHaveBeenCalledWith('c1', Rating.AGAIN, expect.any(Object));
    expect(queueCardReview.mock.invocationCallOrder[0]).toBeLessThan(updateCard.mock.invocationCallOrder[0]);
  });

  it('never throws when a write fails', async () => {
    updateCard.mockRejectedValueOnce(new Error('network'));
    recordReview.mockRejectedValueOnce(new Error('network'));
    await expect(rateCard({ card, rating: Rating.HARD, userId: 'u1', surface: 'spark' })).resolves.toBeDefined();
  });

  it('skips review history without a user', async () => {
    await rateCard({ card, rating: Rating.EASY, userId: null, surface: 'spark' });
    expect(recordReview).not.toHaveBeenCalled();
  });
});
