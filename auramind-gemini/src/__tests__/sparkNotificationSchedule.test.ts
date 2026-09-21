import { describe, expect, it } from 'vitest';
import {
  MIN_SPACING_MINUTES,
  SPARK_NOTIFICATION_IDS,
  buildSparkNotificationPlan,
} from '../lib/sparkNotificationSchedule';

const MORNING = new Date(2026, 8, 20, 8, 5, 0).getTime(); // 08:05 local — app start
const NOW = new Date(2026, 8, 20, 12, 0, 0).getTime(); // 12:00 local
const HOUR = 3_600_000;
const RAND_FIXED = () => 0.5;

describe('buildSparkNotificationPlan', () => {
  it('produces the requested count, sorted, inside the waking window', () => {
    const plan = buildSparkNotificationPlan({ count: 3, now: MORNING, rand: RAND_FIXED });
    expect(plan).toHaveLength(3);
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i].at).toBeGreaterThan(plan[i - 1].at);
    }
    const dayStart = new Date(MORNING); dayStart.setHours(0, 0, 0, 0);
    for (const p of plan) {
      expect(p.at).toBeGreaterThan(dayStart.getTime() + 8 * HOUR);
      expect(p.at).toBeLessThan(dayStart.getTime() + 22 * HOUR);
      expect(p.at).toBeGreaterThan(MORNING); // never in the past
    }
  });

  it('spaces times at least MIN_SPACING_MINUTES apart', () => {
    const plan = buildSparkNotificationPlan({ count: 4, now: MORNING, rand: Math.random });
    for (let i = 1; i < plan.length; i++) {
      expect(plan[i].at - plan[i - 1].at).toBeGreaterThanOrEqual(MIN_SPACING_MINUTES * 60_000);
    }
  });

  it('uses the fixed ID pool in order', () => {
    const plan = buildSparkNotificationPlan({ count: 3, now: MORNING, rand: RAND_FIXED });
    expect(plan.map((p) => p.id)).toEqual(SPARK_NOTIFICATION_IDS.slice(0, 3));
  });

  it('skips past times when re-planning late in the day', () => {
    const evening = new Date(2026, 8, 20, 17, 0, 0).getTime(); // 17:00
    const plan = buildSparkNotificationPlan({ count: 4, now: evening, rand: RAND_FIXED });
    expect(plan.every((p) => p.at > evening)).toBe(true);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.length).toBeLessThan(4);
  });

  it('returns nothing when the window has closed', () => {
    const lateNight = new Date(2026, 8, 20, 21, 55, 0).getTime();
    const plan = buildSparkNotificationPlan({ count: 4, now: lateNight, rand: RAND_FIXED });
    expect(plan).toEqual([]);
  });

  it('is deterministic for a fixed rand', () => {
    const a = buildSparkNotificationPlan({ count: 3, now: MORNING, rand: RAND_FIXED });
    const b = buildSparkNotificationPlan({ count: 3, now: MORNING, rand: RAND_FIXED });
    expect(a).toEqual(b);
  });

  it('caps the count at the ID pool size', () => {
    const plan = buildSparkNotificationPlan({ count: 99, now: MORNING, rand: RAND_FIXED });
    expect(plan.length).toBeLessThanOrEqual(SPARK_NOTIFICATION_IDS.length);
  });

  it('handles a nonsensical window by returning nothing', () => {
    const plan = buildSparkNotificationPlan({ count: 2, now: NOW, wakeStartHour: 20, wakeEndHour: 6, rand: RAND_FIXED });
    expect(plan).toEqual([]);
  });
});
