import { computeStreak, deriveRetention7d, dueCards, type Card, type Deck, type StudySession } from '@bonamind/core';

/** Seconds a review takes on average; drives the "About N minutes" estimate. */
export const SECONDS_PER_CARD = 30;

export interface CourseRow { deck: Deck; due: number; reviewed: number; total: number }

export interface TodaySummary {
  due: number;
  minutes: number;
  topDeckId: string | null;
  streak: number;
  recall: number | undefined;
  courses: CourseRow[];
}

/** Everything the Today screen shows, from cached decks, cards and sessions. */
export function summarizeToday(decks: Deck[], cards: Card[], sessions: StudySession[], now: Date): TodaySummary {
  const due = dueCards(cards, now.getTime());
  const dueByDeck = new Map<string, number>();
  for (const c of due) dueByDeck.set(c.deckId, (dueByDeck.get(c.deckId) ?? 0) + 1);
  const reviewedByDeck = new Map<string, number>();
  const totalByDeck = new Map<string, number>();
  for (const c of cards) {
    totalByDeck.set(c.deckId, (totalByDeck.get(c.deckId) ?? 0) + 1);
    if ((c.repetition ?? 0) > 0 || c.lastReviewed) reviewedByDeck.set(c.deckId, (reviewedByDeck.get(c.deckId) ?? 0) + 1);
  }
  let topDeckId: string | null = null;
  let topDue = 0;
  for (const [deckId, n] of dueByDeck) if (n > topDue) { topDue = n; topDeckId = deckId; }
  return {
    due: due.length,
    minutes: Math.ceil((due.length * SECONDS_PER_CARD) / 60),
    topDeckId,
    streak: computeStreak(sessions, now),
    recall: deriveRetention7d(sessions, now.getTime()),
    courses: decks.map((deck) => ({
      deck,
      due: dueByDeck.get(deck.id) ?? 0,
      reviewed: reviewedByDeck.get(deck.id) ?? 0,
      total: totalByDeck.get(deck.id) ?? deck.cardCount,
    })),
  };
}

export function minutesLabel(minutes: number): string {
  return `About ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`;
}

/** Case-insensitive match on deck titles and card fronts. */
export function searchLibrary(decks: Deck[], cards: Card[], query: string): { decks: Deck[]; cards: Card[] } {
  const q = query.trim().toLowerCase();
  if (!q) return { decks: [], cards: [] };
  const hitCards = cards.filter((c) => c.front.toLowerCase().includes(q));
  const deckIdsWithHits = new Set(hitCards.map((c) => c.deckId));
  return {
    decks: decks.filter((d) => d.title.toLowerCase().includes(q) || deckIdsWithHits.has(d.id)),
    cards: hitCards,
  };
}
