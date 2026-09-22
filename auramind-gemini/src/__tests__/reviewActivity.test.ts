import { describe, expect, it } from 'vitest';
import { bucketReviewsByDay } from '../services/database/modules/reviewActivityService';

// Fixed "now": Sunday 2026-09-20 12:00 local. Pinning now makes every
// boundary deterministic regardless of when the suite runs.
const NOW = new Date(2026, 8, 20, 12, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;

describe('bucketReviewsByDay', () => {
  it('buckets reviews into trailing calendar days ending today', () => {
    const days = bucketReviewsByDay(
      [NOW, NOW - 1000, NOW - DAY, NOW - 2 * DAY - 5000],
      3,
      NOW,
    );
    expect(days.map(d => d.count)).toEqual([1, 1, 2]);
    expect(days.map(d => d.studied)).toEqual([true, true, true]);
    // chronological, ending today (Sunday)
    expect(days.map(d => d.label)).toEqual(['Fri', 'Sat', 'Sun']);
    expect(days[2].date).toBe('2026-09-20');
  });

  it('emits zero-count days instead of gaps', () => {
    const days = bucketReviewsByDay([], 7, NOW);
    expect(days).toHaveLength(7);
    expect(days.every(d => d.count === 0 && d.studied === false)).toBe(true);
    // labels are the real trailing weekdays in order
    expect(days.map(d => d.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });

  it('drops reviews older than the window and ignores garbage', () => {
    const days = bucketReviewsByDay(
      [NOW - 30 * DAY, NaN, Infinity, NOW],
      7,
      NOW,
    );
    const total = days.reduce((acc, d) => acc + d.count, 0);
    expect(total).toBe(1);
    expect(days[6].count).toBe(1);
  });

  it('assigns late-night reviews to the correct local day', () => {
    // 23:59:59 same calendar day as NOW counts today, not yesterday.
    const late = new Date(2026, 8, 19, 23, 59, 59).getTime();
    const days = bucketReviewsByDay([late], 2, NOW);
    expect(days.map(d => d.count)).toEqual([1, 0]);
  });

  it('clamps degenerate day counts to at least one day', () => {
    expect(bucketReviewsByDay([NOW], 0, NOW)).toHaveLength(1);
    expect(bucketReviewsByDay([NOW], -5, NOW)).toHaveLength(1);
  });
});
