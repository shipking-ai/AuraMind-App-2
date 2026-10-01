/**
 * Rate one card: FSRS schedule, persist, review history, offline queue.
 * The study screen's semantics in one place so Quick Review and memory
 * sparks can't drift from it. Never throws: a failed write must not trap the
 * user on a card.
 */
import type { Card, Rating } from '../../types';
import { calculateSRS } from './srs';
import { dbService } from '../database/dbService';
import { cardReviewsService } from '../database/modules/cardReviewsService';
import { isOnline, queueCardReview } from '../offline/offlineStudyService';
import { analyticsService } from '../analytics/analyticsService';

export async function rateCard(input: {
  card: Card;
  rating: Rating;
  userId: string | null | undefined;
  surface: string;
}): Promise<Partial<Card>> {
  const { card, rating, userId, surface } = input;
  const res = calculateSRS(card, rating);
  const now = Date.now();
  const update: Partial<Card> = {
    interval: res.interval,
    repetition: res.repetition,
    easeFactor: res.easeFactor,
    nextReview: now + res.interval * 86_400_000,
    lastReviewed: now,
  };
  if (res.fsrsState) update.fsrsState = res.fsrsState;

  // Same reason as the study screen: updateCard() swallows a failed write,
  // so offline the only durable record is the queue.
  if (!isOnline()) {
    try { await queueCardReview(card.id, rating, res); } catch { /* best effort */ }
  }
  try { await dbService.updateCard(card.id, update); } catch { /* keep the user moving */ }
  if (userId) {
    cardReviewsService
      .recordReview({
        userId,
        cardId: card.id,
        rating,
        srsResult: { interval: res.interval, repetition: res.repetition, easeFactor: res.easeFactor, fsrsState: res.fsrsState },
        reviewedAt: now,
      })
      .catch(() => { /* fire-and-forget */ });
  }
  analyticsService.track('card_rated', { cardId: card.id, surface, rating });
  return update;
}
