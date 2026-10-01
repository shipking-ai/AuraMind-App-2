import { describe, it, expect, vi } from 'vitest';

const retrievability = vi.hoisted(() => new Map<string, number>());
vi.mock('../services/memory/sparkScheduler', () => ({
  SPARK_BAND_MIN: 0.65,
  SPARK_BAND_MAX: 0.9,
  cardRetrievability: (card: { id: string }) => retrievability.get(card.id) ?? 1,
}));

import { computeDueState } from '../desktop/dueState';
import type { Card, Deck } from '../types';

const NOW = 1_800_000_000_000;
const deck = (id: string, title: string) => ({ id, title }) as Deck;
const card = (id: string, deckId: string, nextReview: number, lastReviewed?: number) =>
  ({ id, deckId, front: id, back: id, nextReview, lastReviewed }) as Card;

describe('computeDueState', () => {
  it('counts due cards and names the two decks with the most', () => {
    const state = computeDueState({
      cards: [card('a', 'es', NOW - 1), card('b', 'es', NOW), card('c', 'bio', NOW - 5), card('d', 'law', NOW - 5), card('e', 'bio', NOW - 1), card('f', 'es', NOW + 1)],
      decks: [deck('es', 'Spanish A1'), deck('bio', 'Enzymes'), deck('law', 'Con Law')],
      now: NOW,
      streak: 12,
      studying: false,
    });
    expect(state).toEqual({ due: 5, fadingCount: 0, topDecks: ['Enzymes', 'Spanish A1'], streak: 12, studying: false });
  });

  it('treats a card with no schedule as due, like the study screen', () => {
    expect(computeDueState({ cards: [{ id: 'x', deckId: 'd', front: '', back: '' } as Card], decks: [], now: NOW, streak: 0, studying: false }).due).toBe(1);
  });

  it('counts only reviewed cards in the spark band as fading', () => {
    retrievability.set('a', 0.7).set('b', 0.95).set('c', 0.6).set('d', 0.8);
    const state = computeDueState({
      cards: [card('a', 'es', NOW + 9, NOW - 9), card('b', 'es', NOW + 9, NOW - 9), card('c', 'es', NOW + 9, NOW - 9), card('d', 'es', NOW + 9)],
      decks: [deck('es', 'Spanish A1')],
      now: NOW,
      streak: 0,
      studying: true,
    });
    expect(state.fadingCount).toBe(1); // a only: b too strong, c too weak, d never reviewed
    expect(state.studying).toBe(true);
  });
});
