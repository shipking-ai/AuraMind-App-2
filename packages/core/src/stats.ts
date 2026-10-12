/**
 * Study statistics derived from `study_sessions`, shared by the website's
 * useStudyStats hook and the native app. `now` is injectable for tests.
 */
import type { Card, StudySession } from './types';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** Local-calendar-date key, so "same day" ignores the time and the format. */
export function toLocalDateKey(value: number | string | Date): string {
  return new Date(value).toDateString();
}

/**
 * Consecutive local study days ending today. If the user hasn't studied yet
 * today but did yesterday, the streak is anchored at yesterday so it isn't
 * broken until a full day is missed.
 */
export function computeStreak(sessions: StudySession[], now: Date = new Date()): number {
  const dateKeys = new Set<string>();
  for (const s of sessions) {
    if (s.startTime == null) continue;
    dateKeys.add(toLocalDateKey(s.startTime));
  }
  if (dateKeys.size === 0) return 0;

  const anchor = new Date(now);
  if (!dateKeys.has(toLocalDateKey(now))) {
    anchor.setDate(anchor.getDate() - 1);
    if (!dateKeys.has(toLocalDateKey(anchor))) return 0;
  }

  let streak = 0;
  const cursor = new Date(anchor);
  while (dateKeys.has(toLocalDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * Average accuracy (0..1) across sessions started in the last 7 days.
 * Prefers exact answer counts; falls back to the older 0..100 `accuracy`.
 */
export function deriveRetention7d(sessions: StudySession[], now: number = Date.now()): number | undefined {
  const cutoff = now - WEEK_MS;
  let answered = 0;
  let correct = 0;
  for (const s of sessions) {
    if ((s.startTime ?? 0) < cutoff) continue;
    const total = s.totalAnswers ?? s.cardsStudied ?? 0;
    if (total <= 0) continue;
    const ok = s.correctAnswers ?? (s.accuracy != null ? Math.round((s.accuracy / 100) * total) : 0);
    answered += total;
    correct += ok;
  }
  return answered > 0 ? correct / answered : undefined;
}

/** Cards due at `now`, soonest first. A card with no schedule is due. */
export function dueCards(cards: Card[], now: number): Card[] {
  return cards
    .filter((c) => (c.nextReview ?? 0) <= now)
    .sort((a, b) => (a.nextReview ?? 0) - (b.nextReview ?? 0));
}
