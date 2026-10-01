import type { Card, Deck } from '../types';
import type { DueState } from './bridge';
import { cardRetrievability, SPARK_BAND_MAX, SPARK_BAND_MIN } from '../services/memory/sparkScheduler';

/** What the tray, badge and nudges show. Pure; FSRS stays in TypeScript. */
export function computeDueState(input: {
  cards: Card[];
  decks: Deck[];
  now: number;
  streak: number;
  studying: boolean;
}): DueState {
  const { cards, decks, now, streak, studying } = input;
  const dueByDeck = new Map<string, number>();
  let due = 0;
  let fadingCount = 0;
  for (const card of cards) {
    if ((card.nextReview ?? 0) <= now) {
      due += 1;
      dueByDeck.set(card.deckId, (dueByDeck.get(card.deckId) ?? 0) + 1);
    }
    if (card.lastReviewed) {
      const r = cardRetrievability(card, now);
      if (r >= SPARK_BAND_MIN && r <= SPARK_BAND_MAX) fadingCount += 1;
    }
  }
  const titles = new Map(decks.map((d) => [d.id, d.title]));
  const topDecks = [...dueByDeck.entries()]
    .map(([id, count]) => ({ title: titles.get(id), count }))
    .filter((d): d is { title: string; count: number } => Boolean(d.title))
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title))
    .slice(0, 2)
    .map((d) => d.title);
  return { due, fadingCount, topDecks, streak, studying };
}
