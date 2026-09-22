/**
 * Notification-time planner for memory sparks (Surface 2).
 *
 * Pure: given a day's constraints and a random source, produce N one-shot
 * notification times inside waking hours, spaced at least MIN_SPACING_MINUTES
 * apart. Card selection happens at schedule time (the hook), not here — the
 * planner deals only in wall-clock times so it stays trivially testable.
 *
 * These are ONE-SHOT notifications (schedule.at), deliberately avoiding the
 * `repeats` flag whose absence silently turned daily reminders into one-shot
 * alarms (see HANDOFF traps). One-shots are re-planned daily by useSparkSync.
 */

/** Fixed IDs — cancel-first rescheduling replaces, never stacks. */
export const SPARK_NOTIFICATION_IDS = [7411, 7412, 7413, 7414] as const;

/** Minimum spacing between sparks on the same day, minutes. */
export const MIN_SPACING_MINUTES = 120;

export interface SparkNotificationPlan {
  id: number;
  /** Epoch ms for schedule.at. */
  at: number;
}

/** Default waking window, matching the quiet-hours defaults. */
export const DEFAULT_WAKE_START_HOUR = 8;
export const DEFAULT_WAKE_END_HOUR = 22;

/**
 * Plan up to `count` one-shot times for the day containing `now` (local time).
 * Times are sorted ascending, ≥ MIN_SPACING_MINUTES apart, and strictly inside
 * [wakeStart, wakeEnd). Times already in the past (or inside the spacing of a
 * previously accepted time) are skipped — a re-plan at 14:00 still schedules
 * the 16:00/19:00 sparks. If the window can't fit the requested count, fewer
 * are returned (possibly zero — e.g. planning at 21:55).
 */
export function buildSparkNotificationPlan({
  count,
  now,
  wakeStartHour = DEFAULT_WAKE_START_HOUR,
  wakeEndHour = DEFAULT_WAKE_END_HOUR,
  rand = Math.random,
}: {
  count: number;
  now: number;
  wakeStartHour?: number;
  wakeEndHour?: number;
  rand?: () => number;
}): SparkNotificationPlan[] {
  const safeCount = Math.max(0, Math.min(count, SPARK_NOTIFICATION_IDS.length));
  const random = typeof rand === 'function' ? rand : Math.random;

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const windowStart = dayStart.getTime() + wakeStartHour * 3_600_000;
  const windowEnd = dayStart.getTime() + wakeEndHour * 3_600_000;

  // Sanity: a nonsensical window produces no plan.
  if (windowEnd <= windowStart) return [];

  const span = windowEnd - windowStart;
  // Jitter each candidate within the window, sort, then greedily accept ones
  // that respect spacing. Rejection sampling with a spacing floor can starve,
  // so instead: divide the window into `count` bands and jitter inside each —
  // guarantees spacing ≥ band width ≥ span/(count+1) as long as
  // span/(count+1) ≥ MIN_SPACING (enforced below).
  const band = span / (safeCount + 1);
  if (safeCount > 0 && band < MIN_SPACING_MINUTES * 60_000) {
    // Window too short for this many well-spaced sparks — fit what we can.
    const fit = Math.max(0, Math.floor(span / (MIN_SPACING_MINUTES * 60_000)) - 0);
    return buildSparkNotificationPlan({
      count: fit,
      now,
      wakeStartHour,
      wakeEndHour,
      rand: random,
    });
  }

  const times: number[] = [];
  for (let i = 0; i < safeCount; i++) {
    const bandStart = windowStart + band * (i + 0.5);
    const jitter = (random() - 0.5) * band * 0.6;
    times.push(bandStart + jitter);
  }
  times.sort((a, b) => a - b);

  // Drop times already in the past (they'd fire immediately).
  const future = times.filter((t) => t > now + 60_000);
  // Enforce spacing against previously accepted times (past times don't count).
  const accepted: number[] = [];
  for (const t of future) {
    if (accepted.length === 0 || t - accepted[accepted.length - 1] >= MIN_SPACING_MINUTES * 60_000) {
      accepted.push(t);
    }
  }

  return accepted.map((at, i) => ({ id: SPARK_NOTIFICATION_IDS[i], at }));
}
