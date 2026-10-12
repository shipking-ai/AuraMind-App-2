import { Rating, planReview, type Card, type OutboxItem } from '@bonamind/core';
import { overlayPending } from '../overlay';

const T = Date.UTC(2026, 9, 8, 12);
const card = (id: string, lastReviewed?: number): Card => ({ id, deckId: 'd', front: id, back: id, nextReview: T - 1, lastReviewed });

it('keeps a queued review applied after a server refetch', () => {
  const { record, update } = planReview(card('a'), Rating.GOOD, T);
  const pending: OutboxItem[] = [{ id: 'o1', userId: 'u', kind: 'review', reviewedAt: T, attempts: 0, record, update }];
  const [a, b] = overlayPending([card('a'), card('b')], pending);
  expect(a.nextReview).toBe(update.nextReview);
  expect(a.lastReviewed).toBe(T);
  expect(b.nextReview).toBe(T - 1);
});

it('lets a newer server review win over an older queued one', () => {
  const { record, update } = planReview(card('a'), Rating.GOOD, T - 10_000);
  const pending: OutboxItem[] = [{ id: 'o1', userId: 'u', kind: 'review', reviewedAt: T - 10_000, attempts: 0, record, update }];
  const [a] = overlayPending([card('a', T)], pending);
  expect(a.lastReviewed).toBe(T);
});
