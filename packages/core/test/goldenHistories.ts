/**
 * Fixed review histories whose scheduling output is pinned in
 * __golden__/scheduling.json. The website and the native app both run these
 * against the shared scheduler; any drift fails both suites.
 *
 * Kept free of a test-runner import: the website's Vitest and core's Vitest
 * are different module instances, so each caller passes its own clock.
 */
import type { Card, SRSResult } from '../src/types';
import { Rating } from '../src/types';

const DAY_MS = 86_400_000;
export const GOLDEN_START = Date.UTC(2026, 0, 1, 9, 0, 0);

export interface GoldenHistory { name: string; card: Card; ratings: Rating[] }

const fresh = (id: string): Card => ({ id, deckId: 'deck-golden', front: `front ${id}`, back: `back ${id}` });

export const GOLDEN_HISTORIES: GoldenHistory[] = [
  { name: 'new card, good x4', card: fresh('a'), ratings: [Rating.GOOD, Rating.GOOD, Rating.GOOD, Rating.GOOD] },
  { name: 'new card, again then good x3', card: fresh('b'), ratings: [Rating.AGAIN, Rating.GOOD, Rating.GOOD, Rating.GOOD] },
  { name: 'new card, easy x3', card: fresh('c'), ratings: [Rating.EASY, Rating.EASY, Rating.EASY] },
  { name: 'new card, hard good again good', card: fresh('d'), ratings: [Rating.HARD, Rating.GOOD, Rating.AGAIN, Rating.GOOD] },
  {
    name: 'legacy SM-2 card, good',
    card: { ...fresh('e'), interval: 10, easeFactor: 2.5, repetition: 4, lastReviewed: GOLDEN_START - 10 * DAY_MS, nextReview: GOLDEN_START },
    ratings: [Rating.GOOD],
  },
  {
    name: 'personalized new card, good',
    card: {
      ...fresh('f'),
      fsrsState: { stability: 0, difficulty: 3, elapsedDays: 0, scheduledDays: 0, repetitions: 0, lapses: 0, lastReview: 0 },
    },
    ratings: [Rating.GOOD],
  },
];

export type Calc = (card: Card, rating: Rating) => SRSResult & { fsrsState?: unknown };

/** Replays one history, advancing the clock by each returned interval. */
export function runHistory(h: GoldenHistory, calc: Calc, setNow: (ms: number) => void) {
  let now = GOLDEN_START;
  let card: Card = { ...h.card };
  const steps = [];
  for (const rating of h.ratings) {
    setNow(now);
    const r = calc(card, rating);
    steps.push({ rating, interval: r.interval, repetition: r.repetition, easeFactor: r.easeFactor, fsrsState: r.fsrsState });
    card = {
      ...card,
      interval: r.interval,
      repetition: r.repetition,
      easeFactor: r.easeFactor,
      fsrsState: r.fsrsState as Card['fsrsState'],
      lastReviewed: now,
      nextReview: now + r.interval * DAY_MS,
    };
    now = card.nextReview!;
  }
  return { name: h.name, steps };
}
