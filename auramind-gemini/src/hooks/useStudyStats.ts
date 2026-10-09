import { useCallback, useEffect, useState } from 'react';
import { sessionService } from '../services/database/modules/sessionService';
import type { StudySession } from '../types';
import { computeStreak, deriveRetention7d, toLocalDateKey } from '@bonamind/core';

export interface UseStudyStatsReturn {
  /** Raw study sessions fetched from Supabase (newest first). */
  sessions: StudySession[];
  /** Sum of `cardsStudied` across sessions whose `startTime` is today's LOCAL date. */
  cardsReviewedToday: number;
  /** Consecutive local study days ending today (yesterday is allowed as the anchor). */
  streak: number;
  /** Sum of `cardsStudied` across ALL fetched sessions. */
  totalReviews: number;
  /** 0..1 accuracy across sessions started in the last 7 days, when any exist. */
  retention7d?: number;
  /** 0..100 accuracy of the most recent session (newest-first ordering). */
  lastSessionAccuracy?: number;
  loading: boolean;
  error: string | null;
  /** Re-run the fetch against Supabase. */
  refresh: () => Promise<void>;
}

// Shared with the native app.
export { deriveRetention7d };

/** Accuracy (0..100) of the most recent session. Sessions arrive newest-first. */
export function deriveLastSessionAccuracy(sessions: StudySession[]): number | undefined {
  return sessions[0]?.accuracy ?? undefined;
}

/**
 * Read-only hook over the Supabase `study_sessions` table (the single source
 * of truth for study activity). Derives today's reviewed count, a streak, and
 * the lifetime total review count for a user.
 *
 * Pass `null`/`undefined` for `userId` to short-circuit (returns zeros,
 * `loading: false`, and never calls Supabase) — useful for logged-out states.
 */
export function useStudyStats(userId: string | null | undefined): UseStudyStatsReturn {
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [loading, setLoading] = useState<boolean>(() => Boolean(userId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setSessions([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await sessionService.fetchStudySessions(userId);
      setSessions(data ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load study stats');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const todayKey = toLocalDateKey(new Date());
  const cardsReviewedToday = sessions
    .filter((s) => s.startTime != null && toLocalDateKey(s.startTime) === todayKey)
    .reduce((sum, s) => sum + (s.cardsStudied ?? 0), 0);

  const totalReviews = sessions.reduce((sum, s) => sum + (s.cardsStudied ?? 0), 0);

  const streak = computeStreak(sessions);

  return {
    sessions,
    cardsReviewedToday,
    streak,
    totalReviews,
    retention7d: deriveRetention7d(sessions),
    lastSessionAccuracy: deriveLastSessionAccuracy(sessions),
    loading,
    error,
    refresh,
  };
}
