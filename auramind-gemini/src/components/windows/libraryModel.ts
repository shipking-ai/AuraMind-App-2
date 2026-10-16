/** The Windows Library's rows: search, counts and the three sorts. */
import type { Card, Deck } from '../../types';
import { isDue } from './todayModel';

export type LibrarySort = 'due' | 'recent' | 'az';

export interface LibraryRow {
  deck: Deck;
  cards: number;
  due: number;
  lastStudied?: number;
}

export function libraryRows(decks: Deck[], cards: Card[], now: number, query: string, sort: LibrarySort): LibraryRow[] {
  const byDeck = new Map<string, Card[]>();
  for (const c of cards) {
    const list = byDeck.get(c.deckId) ?? [];
    list.push(c);
    byDeck.set(c.deckId, list);
  }
  const q = query.trim().toLowerCase();
  const rows = decks
    .filter((d) => !q || d.title.toLowerCase().includes(q))
    .map((deck) => {
      const list = byDeck.get(deck.id) ?? [];
      let last: number | undefined;
      for (const c of list) if (c.lastReviewed && (last === undefined || c.lastReviewed > last)) last = c.lastReviewed;
      return {
        deck,
        cards: list.length || deck.cardCount || 0,
        due: list.filter((c) => isDue(c, now)).length,
        lastStudied: last,
      };
    });
  const byTitle = (a: LibraryRow, b: LibraryRow) => a.deck.title.localeCompare(b.deck.title);
  if (sort === 'az') return rows.sort(byTitle);
  if (sort === 'recent') return rows.sort((a, b) => (b.lastStudied ?? -1) - (a.lastStudied ?? -1) || byTitle(a, b));
  return rows.sort((a, b) => b.due - a.due || byTitle(a, b));
}

/** "Today", "Yesterday" or "N days ago" for a last-studied timestamp. */
export function studiedLabel(at: number, now: number): string {
  const days = Math.floor((now - at) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}
