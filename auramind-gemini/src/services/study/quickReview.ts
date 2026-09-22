import { Card, Rating } from '../../types';
import { calculateSRS } from './srs';
import { dbService } from '../database/dbService';
import { cardReviewsService } from '../database/modules/cardReviewsService';

/**
 * Grade one card outside a study session (spark pop-ups, the Study Float
 * window). Same path as StudyModePage: calculateSRS → dbService.updateCard →
 * cardReviewsService, so these are real reviews. Returns the card update so
 * the caller can apply it optimistically; throws if the card write fails.
 */
export async function reviewCard(
  card: Card,
  rating: Rating,
  userId: string | null | undefined,
  retention?: number,
): Promise<Partial<Card>> {
  const res = calculateSRS(card, rating, undefined, retention);
  const now = Date.now();
  const update: Partial<Card> = {
    interval: res.interval,
    repetition: res.repetition,
    easeFactor: res.easeFactor,
    nextReview: now + res.interval * 86_400_000,
    lastReviewed: now,
  };
  if (res.fsrsState) update.fsrsState = res.fsrsState;
  await dbService.updateCard(card.id, update);
  if (userId) {
    cardReviewsService
      .recordReview({
        userId,
        cardId: card.id,
        rating,
        srsResult: {
          interval: res.interval,
          repetition: res.repetition,
          easeFactor: res.easeFactor,
          fsrsState: res.fsrsState,
        },
        reviewedAt: now,
      })
      .catch(() => { /* fire-and-forget, same as StudyModePage */ });
  }
  return update;
}
