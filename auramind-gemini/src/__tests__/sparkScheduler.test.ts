import { describe, expect, it, beforeEach } from 'vitest';
import {
  SPARK_BAND_MAX,
  SPARK_BAND_MIN,
  DAILY_SPARK_CAP,
  PER_CARD_DAILY_CAP,
  MIN_SPARK_GAP_MS,
  cardRetrievability,
  cardsSparkedToday,
  clearSparkLog,
  dropPendingSparks,
  fireGate,
  getSparkLog,
  isQuietHour,
  isSparkEligible,
  pickSparkCard,
  recordSpark,
  shouldFireNow,
} from '../services/memory/sparkScheduler';
import type { Card } from '../types';
import { elapsedForRetrievability } from '../services/study/fsrs';

// Fixed "now": 2026-09-20 12:00 local — wide awake by any quiet-hours config.
const NOW = new Date(2026, 8, 20, 12, 0, 0).getTime();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Deterministic rand: always 0.99 (worst case for probability gates). */
const RAND_HIGH = () => 0.99;
/** Always fires (rand() === 0 < any positive gate). */
const RAND_LOW = () => 0;

/**
 * Build a card whose retrievability at `NOW` lands on a target value by
 * controlling lastReviewed relative to stability. Uses the real FSRS state so
 * the test exercises the actual forgetting curve, not a mock.
 */
function cardWithRetrievability(id: string, target: number, deckId = 'deck-1'): Card {
  // Invert the FSRS forgetting curve for a 10-day stability.
  const stabilityDays = 10;
  const elapsedDays = elapsedForRetrievability(target, stabilityDays);
  return {
    id,
    deckId,
    front: `front ${id}`,
    back: `back ${id}`,
    interval: 14,
    easeFactor: 2.5,
    repetition: 3,
    lastReviewed: NOW - elapsedDays * DAY,
    fsrsState: {
      stability: stabilityDays,
      difficulty: 5,
      elapsedDays,
      scheduledDays: 14,
      repetitions: 3,
      lapses: 0,
      lastReview: NOW - elapsedDays * DAY,
    },
  } as Card;
}

const fresh = () => cardWithRetrievability('c1', 0.8);

describe('cardRetrievability', () => {
  it('computes the FSRS forgetting curve at an arbitrary now', () => {
    const card = cardWithRetrievability('c1', 0.8);
    expect(cardRetrievability(card, NOW)).toBeCloseTo(0.8, 2);
  });

  it('returns 0 for never-reviewed cards', () => {
    const card = { id: 'x', deckId: 'd', front: 'f', back: 'b' } as Card;
    expect(cardRetrievability(card, NOW)).toBe(0);
  });
});

describe('isSparkEligible', () => {
  it('accepts a card in the band, reviewed hours ago', () => {
    const card = cardWithRetrievability('c1', 0.8);
    // lastReviewed is ~2.5 days ago for R=0.8/S=10 — older than the 3h floor.
    expect(isSparkEligible(card, NOW, [])).toBe(true);
  });

  it('rejects cards outside the band on both edges', () => {
    expect(isSparkEligible(cardWithRetrievability('hi', SPARK_BAND_MAX + 0.01), NOW, [])).toBe(false);
    expect(isSparkEligible(cardWithRetrievability('lo', SPARK_BAND_MIN - 0.01), NOW, [])).toBe(false);
    expect(isSparkEligible(cardWithRetrievability('mid', SPARK_BAND_MIN), NOW, [])).toBe(true);
    expect(isSparkEligible(cardWithRetrievability('mid2', SPARK_BAND_MAX), NOW, [])).toBe(true);
  });

  it('rejects never-reviewed cards', () => {
    const card = { id: 'x', deckId: 'd', front: 'f', back: 'b' } as Card;
    expect(isSparkEligible(card, NOW, [])).toBe(false);
  });

  it('rejects cards reviewed within the re-review gap', () => {
    const card = cardWithRetrievability('c1', 0.8);
    card.lastReviewed = NOW - HOUR; // 1h ago < 3h floor
    if (card.fsrsState) card.fsrsState.lastReview = NOW - HOUR;
    expect(isSparkEligible(card, NOW, [])).toBe(false);
  });

  it('rejects cards sparked within the min spark gap', () => {
    const card = fresh();
    const history = [{ cardId: 'c1', ts: NOW - MIN_SPARK_GAP_MS + 60 * 1000, surface: 'popup' as const }];
    expect(isSparkEligible(card, NOW, history)).toBe(false);
  });

  it('accepts once the spark gap has elapsed', () => {
    const card = fresh();
    const history = [{ cardId: 'c1', ts: NOW - MIN_SPARK_GAP_MS - 1, surface: 'popup' as const }];
    expect(isSparkEligible(card, NOW, history)).toBe(true);
  });

  it('rejects cards at the per-card daily cap', () => {
    const card = fresh();
    const todayStart = new Date(NOW);
    todayStart.setHours(0, 0, 0, 0);
    const history = Array.from({ length: PER_CARD_DAILY_CAP }, (_, i) => ({
      cardId: 'c1',
      ts: todayStart.getTime() + (i + 1) * HOUR,
      surface: 'popup' as const,
    }));
    expect(isSparkEligible(card, NOW, history)).toBe(false);
  });

  it('ignores yesterday sparks for the per-card daily cap', () => {
    const card = fresh();
    const history = Array.from({ length: PER_CARD_DAILY_CAP }, (_, i) => ({
      cardId: 'c1',
      ts: NOW - DAY + (i + 1) * HOUR,
      surface: 'notification' as const,
    }));
    expect(isSparkEligible(card, NOW, history)).toBe(true);
  });
});

describe('shouldFireNow', () => {
  it('never fires when disabled', () => {
    expect(
      shouldFireNow({
        now: NOW,
        history: [],
        prefs: { enabled: false, popupEnabled: true, notificationsEnabled: true, quietStartHour: 22, quietEndHour: 8 },
        rand: RAND_LOW,
      }),
    ).toBe(false);
  });

  it('fires when the coin comes up low', () => {
    expect(shouldFireNow({ now: NOW, history: [], rand: RAND_LOW })).toBe(true);
  });

  it('does not fire when the coin comes up high', () => {
    expect(shouldFireNow({ now: NOW, history: [], rand: RAND_HIGH })).toBe(false);
  });

  it('respects the daily cap regardless of the coin', () => {
    const todayStart = new Date(NOW);
    todayStart.setHours(0, 0, 0, 0);
    const history = Array.from({ length: DAILY_SPARK_CAP }, (_, i) => ({
      cardId: `c${i}`,
      ts: todayStart.getTime() + (i + 1) * HOUR,
      surface: 'popup' as const,
    }));
    expect(shouldFireNow({ now: NOW, history, rand: RAND_LOW })).toBe(false);
  });

  it('keeps MIN_SPARK_GAP between any two sparks, whatever the card', () => {
    const recent = [{ cardId: 'other', ts: NOW - MIN_SPARK_GAP_MS + 60 * 1000, surface: 'popup' as const }];
    expect(shouldFireNow({ now: NOW, history: recent, rand: RAND_LOW })).toBe(false);
    const old = [{ cardId: 'other', ts: NOW - MIN_SPARK_GAP_MS - 1, surface: 'popup' as const }];
    expect(shouldFireNow({ now: NOW, history: old, rand: RAND_LOW })).toBe(true);
  });

  it('is silent deep inside quiet hours', () => {
    const night = new Date(2026, 8, 20, 2, 0, 0).getTime(); // 02:00, inside 22–8
    expect(isQuietHour(night)).toBe(true);
    expect(shouldFireNow({ now: night, history: [], rand: RAND_LOW })).toBe(false);
  });

  it('fades in across the ramp after quiet ends', () => {
    // 08:05 → 5 minutes into the ramp out of quiet: gate = 5/10.
    const early = new Date(2026, 8, 20, 8, 5, 0).getTime();
    // gate 0.5 * 0.15 = 0.075; rand 0.05 < 0.075 fires, 0.9 does not.
    expect(shouldFireNow({ now: early, history: [], rand: () => 0.05 })).toBe(true);
    expect(shouldFireNow({ now: early, history: [], rand: () => 0.9 })).toBe(false);
  });

  it('fires at full rate well outside quiet hours', () => {
    const noon = new Date(2026, 8, 20, 12, 0, 0).getTime();
    expect(fireGate(noon)).toBe(1);
    expect(shouldFireNow({ now: noon, history: [], rand: RAND_LOW })).toBe(true);
  });
});

describe('isQuietHour / fireGate boundaries', () => {
  it('handles the wrapping window 22→08', () => {
    expect(isQuietHour(new Date(2026, 8, 20, 23, 0).getTime())).toBe(true);
    expect(isQuietHour(new Date(2026, 8, 20, 3, 0).getTime())).toBe(true);
    expect(isQuietHour(new Date(2026, 8, 20, 9, 0).getTime())).toBe(false);
    expect(isQuietHour(new Date(2026, 8, 20, 21, 0).getTime())).toBe(false);
  });

  it('handles a non-wrapping window 01→05', () => {
    const prefs = { enabled: true, popupEnabled: true, notificationsEnabled: true, quietStartHour: 1, quietEndHour: 5 };
    expect(isQuietHour(new Date(2026, 8, 20, 3, 0).getTime(), prefs)).toBe(true);
    expect(isQuietHour(new Date(2026, 8, 20, 12, 0).getTime(), prefs)).toBe(false);
    expect(fireGate(new Date(2026, 8, 20, 6, 0).getTime(), prefs)).toBe(1);
  });

  it('treats start === end as no quiet period', () => {
    const prefs = { enabled: true, popupEnabled: true, notificationsEnabled: true, quietStartHour: 8, quietEndHour: 8 };
    expect(isQuietHour(new Date(2026, 8, 20, 3, 0).getTime(), prefs)).toBe(false);
    expect(fireGate(new Date(2026, 8, 20, 3, 0).getTime(), prefs)).toBe(1);
  });

  it('is 0 deep in quiet and ramps to 1 after it ends', () => {
    expect(fireGate(new Date(2026, 8, 20, 3, 0).getTime())).toBe(0);
    // 08:00 exactly → sinceEnd = 0 → rampFactor(0) = 0. 08:30 → full.
    expect(fireGate(new Date(2026, 8, 20, 8, 0).getTime())).toBe(0);
    expect(fireGate(new Date(2026, 8, 20, 8, 30).getTime())).toBe(1);
  });
});

describe('pickSparkCard', () => {
  it('returns null when nothing is eligible', () => {
    expect(pickSparkCard([], { now: NOW, history: [] })).toBeNull();
    const neverStudied = { id: 'x', deckId: 'd', front: 'f', back: 'b' } as Card;
    expect(pickSparkCard([neverStudied], { now: NOW, history: [] })).toBeNull();
  });

  it('only picks from the eligible set', () => {
    const eligible = cardWithRetrievability('in-band', 0.8);
    const tooFresh = cardWithRetrievability('forgotten', 0.3);
    const picks = new Set(
      Array.from({ length: 20 }, () => pickSparkCard([eligible, tooFresh], { now: NOW, history: [] })?.id),
    );
    expect(picks).toEqual(new Set(['in-band']));
  });

  it('honors deck exclusion (used to avoid sparking the deck being studied)', () => {
    const a = cardWithRetrievability('a', 0.8, 'deck-a');
    const b = cardWithRetrievability('b', 0.7, 'deck-b');
    const pick = pickSparkCard([a, b], { now: NOW, history: [], excludeDeckIds: ['deck-a'] });
    expect(pick?.id).toBe('b');
  });

  it('prefers lower retrievability overall', () => {
    const easy = cardWithRetrievability('easy', 0.89);
    const hard = cardWithRetrievability('hard', 0.66);
    let hardPicks = 0;
    for (let i = 0; i < 200; i++) {
      // Seeded jitter so both weights stay positive but hard dominates.
      const seq = () => 0.5;
      if (pickSparkCard([easy, hard], { now: NOW, history: [], rand: seq })?.id === 'hard') hardPicks++;
    }
    // weight_hard ≈ (0.29)^2 vs weight_easy ≈ (0.06)^2 → hard wins ~96% of rolls.
    expect(hardPicks).toBeGreaterThan(150);
  });
});

describe('spark log', () => {
  beforeEach(() => clearSparkLog());

  it('records and reads back events', () => {
    recordSpark('popup', 'c1', NOW);
    recordSpark('notification', 'c2', NOW + 1);
    const log = getSparkLog();
    expect(log).toHaveLength(2);
    expect(log[0]).toEqual({ cardId: 'c1', ts: NOW, surface: 'popup' });
  });

  it('drops events older than retention on write', () => {
    recordSpark('popup', 'old', NOW - 8 * DAY);
    recordSpark('popup', 'new', NOW);
    expect(getSparkLog().map((e) => e.cardId)).toEqual(['new']);
  });

  it('dropPendingSparks forgets only future events of that surface', () => {
    recordSpark('notification', 'fired', NOW - HOUR);
    recordSpark('notification', 'pending', NOW + HOUR);
    recordSpark('popup', 'popup-later', NOW + HOUR);
    dropPendingSparks('notification', NOW);
    expect(getSparkLog().map((e) => e.cardId)).toEqual(['fired', 'popup-later']);
  });

  it('cardsSparkedToday returns only today’s ids', () => {
    recordSpark('popup', 'today', NOW - HOUR);
    recordSpark('interleave', 'yesterday', NOW - DAY - HOUR);
    expect(cardsSparkedToday(NOW, getSparkLog())).toEqual(new Set(['today']));
  });
});
