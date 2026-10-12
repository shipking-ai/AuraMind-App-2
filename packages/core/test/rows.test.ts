import { expect, it } from 'vitest';
import { mapCardRow, mapDeckRow, mapSessionRow } from '../src';

it('maps a card row to the in-memory Card', () => {
  const card = mapCardRow({
    id: 'c1', deck_id: 'd1', front: 'F', back: 'B', image: null,
    next_review: '2026-10-08T00:00:00.000Z', last_reviewed: '2026-10-07T00:00:00.000Z',
    interval: 3, ease_factor: null, repetition: 2, lapses: 1,
    fsrs_state: '{"stability":2,"difficulty":5,"elapsedDays":0,"scheduledDays":3,"repetitions":2,"lapses":1,"lastReview":1}',
  });
  expect(card).toMatchObject({
    id: 'c1', deckId: 'd1', front: 'F', back: 'B', interval: 3, easeFactor: 2.5, repetition: 2, lapses: 1,
    nextReview: Date.UTC(2026, 9, 8), lastReviewed: Date.UTC(2026, 9, 7),
  });
  expect(card.fsrsState?.stability).toBe(2);
});

it('maps a deck row with its card count', () => {
  expect(mapDeckRow({ id: 'd1', name: 'Cell biology', description: 'x', created_at: '2026-10-08T00:00:00.000Z' }, 12))
    .toEqual({ id: 'd1', title: 'Cell biology', description: 'x', createdAt: Date.UTC(2026, 9, 8), cardCount: 12, isSample: false, sourceLabel: undefined });
});

it('maps a study session row', () => {
  expect(mapSessionRow({
    id: 's1', user_id: 'u1', deck_id: 'd1', started_at: '2026-10-08T00:00:00.000Z', ended_at: null,
    cards_studied: 5, correct_answers: 4, total_answers: 5, accuracy: 80, duration_ms: 60000,
  })).toEqual({
    id: 's1', userId: 'u1', deckId: 'd1', startTime: Date.UTC(2026, 9, 8), endTime: undefined,
    cardsStudied: 5, correctAnswers: 4, totalAnswers: 5, accuracy: 80, duration: 60000,
  });
});
