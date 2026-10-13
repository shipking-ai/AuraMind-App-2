/**
 * useSessionReplay — Pull the user's most-recent study session so the
 * SessionReplayModal can step the user through it: which card, which
 * rating, how long it took, FSRS state at the time.
 *
 * Backed by the existing `study_sessions` + `card_reviews` tables (both
 * created by migration `20260717_missing_tables_and_rpcs.sql`). On failures
 * we degrade to a brief in-memory list from localStorage so the UI never
 * hard-blanks for offline users.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/database/supabase';

export interface ReplayEntry {
  id: string;
  cardId: string;
  front: string;
  back: string;
  rating: 'again' | 'hard' | 'good' | 'easy';
  reviewedAt: number; // ms epoch
  /** Self-reported time to answer (ms); 0 if unknown. */
  latencyMs?: number;
  /** Optional FSRS hints at the moment of review. */
  lapses?: number;
  difficulty?: number;
}

export interface ReplaySession {
  id: string;
  startedAt: number;
  endedAt: number;
  deckTitle?: string;
  entries: ReplayEntry[];
}

export interface SessionReplayState {
  session: ReplaySession | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const LS_KEY = 'bonamind.sessionReplay.lastSession';

function safeRead(): ReplayEntry[] | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed as ReplayEntry[];
  } catch {
    return null;
  }
}

export function useSessionReplay(userId: string | undefined): SessionReplayState {
  const [session, setSession] = useState<ReplaySession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  useEffect(() => {
    if (userId === undefined) {
      // userId still loading
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);

      const fallback: ReplaySession | null = (() => {
        const ls = safeRead();
        if (!ls || ls.length === 0) return null;
        return {
          id: 'local',
          startedAt: ls[0]?.reviewedAt ?? Date.now(),
          endedAt: ls[ls.length - 1]?.reviewedAt ?? Date.now(),
          entries: ls,
        };
      })();

      if (!supabase || !userId) {
        if (!cancelled) {
          setSession(fallback);
          setLoading(false);
        }
        return;
      }

      let sessionRow: any = null;
      let reviewRows: any[] = [];
      try {
        // The newest session may have zero reviews (e.g. reviews failed to
        // persist while the record_card_review RPC was missing, or a test
        // session was saved without reviews). Walk the 5 most recent
        // sessions and use the newest one that actually has card_reviews
        // rows inside its [started_at, ended_at] window.
        const { data: sessions, error: sErr } = await supabase
          .from('study_sessions')
          .select('id, started_at, ended_at, deck_id, decks(name)')
          .eq('user_id', userId)
          .order('started_at', { ascending: false })
          .limit(5);

        if (sErr) {
          console.warn('[SessionReplay] study_sessions query failed:', sErr.message);
          throw sErr;
        }

        for (const cand of sessions ?? []) {
          const { data, error: rErr } = await supabase
            .from('card_reviews')
            .select('id, card_id, rating, reviewed_at, cards(front, back)')
            .eq('user_id', userId)
            .gte('reviewed_at', cand.started_at)
            .lte('reviewed_at', cand.ended_at ?? new Date().toISOString())
            .order('reviewed_at', { ascending: true })
            .limit(64);

          if (rErr) {
            console.warn('[SessionReplay] card_reviews query failed:', rErr.message);
            throw rErr;
          }
          if (data && data.length > 0) {
            sessionRow = cand;
            reviewRows = data;
            break;
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setSession(fallback);
          setLoading(false);
        }
        return;
      }

      try {
        const deckTitle =
          (Array.isArray((sessionRow as any).decks)
            ? (sessionRow as any).decks?.[0]?.name
            : (sessionRow as any).decks?.name) || undefined;

        const entries: ReplayEntry[] = (reviewRows ?? []).map((r: any) => {
          const cardObj = Array.isArray(r.cards) ? r.cards?.[0] : r.cards;
          return {
            id: r.id,
            cardId: r.card_id,
            front: cardObj?.front ?? '(card)',
            back: cardObj?.back ?? '',
            rating: mapRating(r.rating),
            reviewedAt: Date.parse(r.reviewed_at ?? '') || Date.now(),
            latencyMs: undefined,
          };
        });

        if (!cancelled) {
          if (!sessionRow) {
            setSession(fallback);
            setLoading(false);
            return;
          }
          setSession({
            id: sessionRow.id,
            startedAt: Date.parse(sessionRow.started_at ?? '') || Date.now(),
            endedAt: Date.parse(sessionRow.ended_at ?? '') || Date.now(),
            deckTitle,
            entries,
          });
          if (entries.length > 0) {
            try {
              window.localStorage.setItem(LS_KEY, JSON.stringify(entries));
            } catch { /* intentionally ignored */ }
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setSession(fallback);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, refreshTick]);

  return { session, loading, error, refresh };
}

function mapRating(r: number | string | null | undefined): ReplayEntry['rating'] {
  if (r === null || r === undefined) return 'good';
  if (typeof r === 'number') {
    // FSRS v5 rating values per `src/types/index.ts` (`Rating` enum):
    //   AGAIN = 0, HARD = 3, GOOD = 4, EASY = 5.
    // The pre-fix mapping assumed an Anki-style 1..4 scale and silently
    // re-rounded 3→"good", 4→"easy" — every "Hard" review rendered as a
    // green badge and every "Good" review rendered as a blue badge. The
    // 5-rail half-open bucket here is deliberately permissive so any
    // future scheme (FSRS v6 ratings, manual override integers) degrades
    // to 'good' instead of a blank badge.
    //
    // Legacy noise: pre-fix rows written by `offlineStudyService.syncOfflineData`
    // may have used Anki-style integers 1..4. The new mapping buckets
    // 1, 2, 3 all into 'hard' — for those user IDs, every historical
    // "good" (=3) review will render as a Hard badge. Acceptable for
    // forward-looking data; if legacy replay fidelity matters, schedule
    // a backfill migration that re-maps 1→again, 2→hard, 3→good.
    if (r <= 0) return 'again';
    if (r <= 3) return 'hard';
    if (r <= 4) return 'good';
    return 'easy';
  }
  const s = String(r).toLowerCase();
  if (s.includes('again')) return 'again';
  if (s.includes('hard')) return 'hard';
  if (s.includes('easy')) return 'easy';
  return 'good';
}
