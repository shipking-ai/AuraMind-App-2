import { describe, expect, it } from 'vitest';
import { fsrs, generatorParameters, createEmptyCard, Rating as FsrsRating } from 'ts-fsrs';
import { calculateSRS, formatInterval, previewIntervals } from '../services/study/srs';
import {
  DEFAULT_WEIGHTS,
  FSRS_PARAMETERS,
  elapsedForRetrievability,
  forgettingCurve,
} from '../services/study/fsrs';
import { Rating, type Card } from '../types';

// Regression cover for the scheduler rewrite. The previous hand-written
// "FSRS" made intervals ~140x too long: Hard could schedule a card 36,500
// days (100 years) out and Good several years, so cards vanished after a
// couple of reviews. These tests pin sane, reference-matching behaviour.

const DAY = 86_400_000;

function newCard(): Card {
  return { id: 'c', deckId: 'd', front: 'q', back: 'a', repetition: 0 } as Card;
}

/** Review `card` with `rating` exactly when it is due, returning the next card. */
function reviewOnDue(card: Card, rating: Rating): { card: Card; interval: number } {
  const res = calculateSRS(card, rating);
  const last = Date.now() - res.interval * DAY; // pretend the interval has passed
  return {
    interval: res.interval,
    card: {
      ...card,
      interval: res.interval,
      repetition: res.repetition,
      lastReviewed: last,
      nextReview: Date.now(),
      fsrsState: { ...res.fsrsState!, lastReview: last },
    } as Card,
  };
}

describe('FSRS scheduler', () => {
  it('schedules a new card in whole days, Again < Hard <= Good < Easy', () => {
    const i = previewIntervals(newCard());
    expect(i[Rating.AGAIN]).toBe(1);
    expect(i[Rating.HARD]).toBeGreaterThanOrEqual(1);
    expect(i[Rating.GOOD]).toBeGreaterThanOrEqual(i[Rating.HARD]);
    expect(i[Rating.EASY]).toBeGreaterThan(i[Rating.GOOD]);
    for (const days of Object.values(i)) expect(Number.isInteger(days)).toBe(true);
  });

  it('matches ts-fsrs for a new card (long-term mode, default parameters)', () => {
    const f = fsrs(generatorParameters({ enable_fuzz: false, enable_short_term: false, request_retention: 0.9 }));
    const now = new Date();
    const expected = f.next(createEmptyCard(now), now, FsrsRating.Good).card.scheduled_days;
    expect(calculateSRS(newCard(), Rating.GOOD).interval).toBe(Math.max(1, expected));
  });

  it('never throws a young card years out (the old bug)', () => {
    let { card } = reviewOnDue(newCard(), Rating.GOOD);
    ({ card } = reviewOnDue(card, Rating.GOOD));
    const i = previewIntervals(card);
    expect(i[Rating.HARD]).toBeLessThan(60);
    expect(i[Rating.GOOD]).toBeLessThan(120);
    expect(i[Rating.EASY]).toBeLessThan(365);
    // Forgetting a learned card brings it back within days, sooner than Hard.
    expect(i[Rating.AGAIN]).toBeLessThanOrEqual(3);
    expect(i[Rating.AGAIN]).toBeLessThan(i[Rating.HARD]);
  });

  it('grows intervals steadily when every review is Good', () => {
    let card = newCard();
    const seen: number[] = [];
    for (let k = 0; k < 5; k++) {
      const r = reviewOnDue(card, Rating.GOOD);
      seen.push(r.interval);
      card = r.card;
    }
    for (let k = 1; k < seen.length; k++) expect(seen[k]).toBeGreaterThan(seen[k - 1]);
    expect(seen[4]).toBeLessThan(3650);
  });

  it('Again resets the streak and counts a lapse', () => {
    let { card } = reviewOnDue(newCard(), Rating.GOOD);
    ({ card } = reviewOnDue(card, Rating.GOOD));
    const res = calculateSRS(card, Rating.AGAIN);
    expect(res.repetition).toBe(0);
    expect(res.fsrsState?.lapses).toBe(1);
    expect(res.interval).toBeLessThanOrEqual(3);
  });

  it('ignores the legacy 20-number profile weights', () => {
    const card = reviewOnDue(newCard(), Rating.GOOD).card;
    expect(calculateSRS(card, Rating.GOOD, DEFAULT_WEIGHTS).interval).toBe(
      calculateSRS(card, Rating.GOOD).interval,
    );
    expect(FSRS_PARAMETERS.length).toBe(21);
  });

  it('a lower retention target spaces reviews further apart', () => {
    const card = reviewOnDue(reviewOnDue(newCard(), Rating.GOOD).card, Rating.GOOD).card;
    expect(calculateSRS(card, Rating.GOOD, undefined, 0.8).interval).toBeGreaterThan(
      calculateSRS(card, Rating.GOOD, undefined, 0.9).interval,
    );
  });
});

describe('forgetting curve', () => {
  it('is 90% after exactly one stability period, and inverts', () => {
    expect(forgettingCurve(10, 10)).toBeCloseTo(0.9, 6);
    expect(forgettingCurve(0, 10)).toBeCloseTo(1, 6);
    expect(forgettingCurve(elapsedForRetrievability(0.8, 10), 10)).toBeCloseTo(0.8, 6);
  });
});

describe('formatInterval', () => {
  it('uses days, then weeks, months and years', () => {
    expect(formatInterval(1)).toBe('1d');
    expect(formatInterval(13)).toBe('13d');
    expect(formatInterval(21)).toBe('3w');
    expect(formatInterval(90)).toBe('3mo');
    expect(formatInterval(548)).toBe('1.5y');
  });
});
