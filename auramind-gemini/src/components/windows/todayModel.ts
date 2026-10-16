/** Pure numbers behind the Windows app's Today and Library screens. */
import type { Card, Deck, StudySession } from '../../types';

const WEEK_MS = 7 * 86_400_000;
const SECONDS_PER_CARD = 20;

/** A card with no schedule is due. */
export function isDue(card: Card, now: number): boolean {
  return (card.nextReview ?? 0) <= now;
}

export function dueCount(cards: Card[], now: number): number {
  return cards.reduce((n, c) => (isDue(c, now) ? n + 1 : n), 0);
}

/** About 20 seconds a card, rounded up, at least a minute when anything is due. */
export function reviewMinutes(due: number): number {
  return due <= 0 ? 0 : Math.max(1, Math.ceil((due * SECONDS_PER_CARD) / 60));
}

/** Courses with cards due now, most due first, then by title. */
export function coursesWithDue(decks: Deck[], cards: Card[], now: number): Array<{ deck: Deck; due: number }> {
  const due = new Map<string, number>();
  for (const c of cards) if (isDue(c, now)) due.set(c.deckId, (due.get(c.deckId) ?? 0) + 1);
  return decks
    .map((deck) => ({ deck, due: due.get(deck.id) ?? 0 }))
    .filter((c) => c.due > 0)
    .sort((a, b) => b.due - a.due || a.deck.title.localeCompare(b.deck.title));
}

/** The soonest review still in the future, if any. */
export function nextDueAt(cards: Card[], now: number): number | undefined {
  let next: number | undefined;
  for (const c of cards) {
    const at = c.nextReview ?? 0;
    if (at > now && (next === undefined || at < next)) next = at;
  }
  return next;
}

/** Answers given in the last 7 days (the window `retention7d` covers). */
export function weekAnswered(sessions: StudySession[], now: number): number {
  return sessions.reduce((sum, s) => {
    if ((s.startTime ?? 0) < now - WEEK_MS) return sum;
    return sum + (s.totalAnswers ?? s.cardsStudied ?? 0);
  }, 0);
}
