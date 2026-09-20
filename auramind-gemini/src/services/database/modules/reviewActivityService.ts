/**
 * reviewActivityService — read-side trailing activity for the dashboard.
 *
 * The overview charts (weekly area + pill sparklines) used to render
 * sin-wave fiction seeded by point-in-time counters. This module reads the
 * real per-review history from `card_reviews` (one row per review since
 * 20260916000000_card_reviews_history; RLS-scoped to the caller's own rows
 * via `auth.uid() = user_id`, with the (user_id, reviewed_at) index covering
 * the ranged read) and buckets it by local calendar day.
 *
 * Offline / error contract: `fetchDailyReviewCounts` returns `null` when
 * there is no backend or the query fails, so callers fall back to bucketing
 * the already-loaded client cards (real partial data) instead of inventing
 * numbers. `bucketReviewsByDay` is pure and unit-tested.
 */
import { supabase } from '../supabase';

export interface DayActivity {
  /** Local calendar day key, YYYY-MM-DD — stable for React keys. */
  date: string;
  /** Short weekday label for the x-axis (Mon, Tue, …). */
  label: string;
  /** Reviews recorded that day. */
  count: number;
  /** True when count > 0. */
  studied: boolean;
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Bucket review timestamps (ms epoch) into per-day counts for the trailing
 * `days` calendar days ending today (local time). Days with no reviews are
 * present with count 0 — the chart renders an honest flat baseline, never
 * a gap or an invented wave.
 */
export function bucketReviewsByDay(
  reviewedAtMs: number[],
  days: number,
  now: number = Date.now(),
): DayActivity[] {
  const safeDays = Math.max(1, Math.floor(days));
  const perDay = new Map<string, number>();
  for (const ts of reviewedAtMs) {
    if (!Number.isFinite(ts)) continue;
    perDay.set(dayKey(new Date(ts)), (perDay.get(dayKey(new Date(ts))) ?? 0) + 1);
  }
  const out: DayActivity[] = [];
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  for (let i = safeDays - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = dayKey(d);
    const count = perDay.get(key) ?? 0;
    out.push({ date: key, label: WEEKDAY[d.getDay()], count, studied: count > 0 });
  }
  return out;
}

/**
 * Fetch the user's review timestamps for the trailing `days` days and
 * bucket them. Returns null when there is no backend or the query fails —
 * callers must fall back to client-side data, never to invented data.
 */
export async function fetchDailyReviewCounts(
  userId: string,
  days: number,
): Promise<DayActivity[] | null> {
  if (!supabase || !userId) return null;
  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('card_reviews')
      .select('reviewed_at')
      .eq('user_id', userId)
      .gte('reviewed_at', cutoff)
      .order('reviewed_at', { ascending: true })
      .limit(5000);
    if (error || !data) return null;
    const stamps = data
      .map((r: { reviewed_at?: string | null }) => (r.reviewed_at ? Date.parse(r.reviewed_at) : NaN))
      .filter((ts: number) => Number.isFinite(ts));
    return bucketReviewsByDay(stamps, days);
  } catch {
    return null;
  }
}
