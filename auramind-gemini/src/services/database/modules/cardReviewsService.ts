/**
 * cardReviewsService — write-side companion to `useSessionReplay`.
 *
 * Background.
 *   Until M6.5, only `offlineStudyService.syncOfflineData` inserted rows into
 *   the `card_reviews` table — meaning any 100% online study session left
 *   `card_reviews` empty and `SessionReplayModal` rendered an empty state.
 *   M6.5 wired StudyModePage → this service → Supabase upsert; it then 403'd
 *   in production because:
 *
 *   (a) the table's INSERT policy was `WITH CHECK (auth.uid() = user_id)`,
 *       which spammed 42501 whenever the reviewer wrote a card they had
 *       ALREADY rated (the UPSERT ON CONFLICT leg routes through UPDATE);
 *   (b) the table's UPDATE policy was bounded to `reviewed_at > NOW() -
 *       INTERVAL '1 hour'`, so any re-grade after the first hour was a
 *       guaranteed 42501 with no UI feedback.
 *
 * M7 (this file) replaces the REST upsert with a single RPC call,
 * `record_card_review(...)`, which:
 *
 *     - validates caller ownership of both the card and the review row;
 *     - performs the write under SECURITY DEFINER;
 *     - permits re-grading at any latency (the 1-hour UPDATE window is gone).
 *
 * Each review inserts its own `card_reviews` row (history, not latest-only),
 * so SessionReplayModal sees per-session rows; offline re-flush stays
 * idempotent via the (user_id, card_id, reviewed_at) key because the queue
 * replays the original review timestamp.
 *
 * The shape on the wire and the error class are unchanged so the
 * StudyModePage + FlowMode catch chains stay the same.
 */
import { supabase } from '../supabase';
import { Rating } from '../../../types';
import { toIsoOrUndef } from '../../../lib/timestamps';

/**
 * Typed error class so callers can branch on a 23514 CHECK constraint
 * violation specifically (vs. generic network/auth errors). The toast
 * the UI shows on this error is actionable — "rating out of range, this
 * session will be replayed correctly on next sync" — instead of the
 * previous red-error spam that panicked users.
 *
 * With M7's RPC, `code` will usually be `42501` (auth mismatch surfaced by
 * the SECURITY DEFINER function) or `P0002` (card not found). UX-wise the
 * callers treat both as "log and continue" — the FP toast is only triggered
 * for the legacy 23514/22P02 path that should never occur through the RPC.
 */
export class CardReviewConstraintError extends Error {
  readonly provider = 'cardReviews' as const;
  readonly code: string;
  readonly rating: number;
  readonly cardId: string;
  constructor(message: string, opts: { code?: string; rating?: number; cardId?: string } = {}) {
    super(message);
    this.name = 'CardReviewConstraintError';
    this.code = opts.code ?? '';
    this.rating = opts.rating ?? NaN;
    this.cardId = opts.cardId ?? '';
  }
}

export interface CardReviewRecord {
  userId: string;
  cardId: string;
  /**
   * FSRS v5 rating. Accepts the canonical `Rating` enum (0..3 / 5) or any
   * raw integer the host app considers valid; coerced via `Number()` so
   * TypeScript enums coerce cleanly even though they're string at runtime.
   */
  rating: Rating | number;
  /** Optional SRS scheduler output snapshot. Defaults to `{}` if omitted. */
  srsResult?: {
    interval?: number;
    repetition?: number;
    easeFactor?: number;
    fsrsState?: unknown;
    [k: string]: unknown;
  };
  /** Defaults to `'fsrs'` — AuraMind's current scheduler. */
  srsAlgorithm?: 'fsrs' | 'sm2';
  /** ms-since-epoch; the RPC prefers a TIMESTAMPTZ ISO string. Defaults to now. */
  reviewedAt?: number;
}

export const cardReviewsService = {
  /**
   * Insert one card_reviews row via the `record_card_review` SECURITY DEFINER
   * RPC. The RPC authorizes the caller (must equal `auth.uid()`), checks
   * that the rated card belongs to the caller (prevents cross-user
   * pollution on shared-deck flows), then inserts under the function
   * owner's privileges so client-side RLS-to-JWT coupling no longer gates
   * a normal re-grade.
   *
   * Re-grading inserts a NEW row (history). The 1-hour UPDATE RLS window
   * was removed alongside the RPC. There is no UI latency threshold that
   * produces 42501.
   */
  async recordReview(review: CardReviewRecord): Promise<void> {
    if (!supabase) {
      // No backend reachable — caller is expected to swallow; this branch
      // also covers SSR / preview environments before env wiring is done.
      return;
    }
    // Coerce rating up-front and validate defensively. The supporting
    // schema (card_reviews CHECK constraint from migration 20260717,
    // relaxed to 0..5 by 20260724000001_card_reviews_rating_range_fix)
    // and the RPC both accept INTEGER 0..5 — AuraMind's FSRS v5 surface
    // maps Again/Hard/Good/Easy to 0/3/4/5. A TS caller can still pass undefined (or any junk) via `as any`;
    // `Number(undefined)` is NaN, NaN fails the RPC's pg_typeof check as
    // `22000`, the UIs catch + log, and the replay entry silently
    // disappears — exactly the silent-failure mode the original bug had.
    // THROW (rather than swallow) so the caller's .catch can chain into
    // a user-visible toast; otherwise we recreate the same silent-failure
    // pattern just one layer up.
    const ratingNum = Number(review.rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 0 || ratingNum > 5) {
      const msg = `[cardReviewsService] dropping out-of-range rating (type=${typeof review.rating}, card=${review.cardId.slice(0, 8)}…): expected integer 0..5 (FSRS v5 current surface)`;
      console.warn(msg);
      throw new Error(msg);
    }
    const reviewedAtIso =
      toIsoOrUndef(review.reviewedAt ?? Date.now()) ?? new Date().toISOString();

    const { error } = await (supabase as any).rpc('record_card_review', {
      p_user_id: review.userId,
      p_card_id: review.cardId,
      p_rating: ratingNum,
      // RPC parameter `p_srs_result` is JSONB NOT NULL; defaulting `{}` in
      // the RPC body is possible but we send {} so the wire payload is
      // obvious to anyone tailing RPC traffic.
      p_srs_result: review.srsResult ?? {},
      p_srs_algorithm: review.srsAlgorithm ?? 'fsrs',
      p_reviewed_at: reviewedAtIso,
    });

    if (error) {
      // We're fire-and-forget in the UI; the caller will .catch and
      // continue. We still surface every error here so the developer
      // console shows the root cause (the previous impl silently
      // swallowed this, which is exactly how the bug stayed latent).
      // Same redaction discipline as the validation guard above:
      // cardId is masked (typed `string`, not UUID-validated); rating is
      // already guaranteed int 0..5 by the time we reach here so we can
      // safely echo its bounded numeric value; `error.message` is passed
      // as the SECOND arg to console.warn on purpose so Sentry's
      // log-scrubbing hooks pattern-match the dangerous position rather
      // than seeing it concatenated into a string a future reader would
      // assume is fully redacted.
      console.warn(
        `[cardReviewsService] recordReview failed (card=${review.cardId.slice(0, 8)}…, rating=${ratingNum}, code=${error.code ?? 'no-code'}):`,
        error.message,
      );
      // Wrap in typed error so the UI can branch and show an actionable
      // toast instead of panicking with a generic red error. The original
      // Supabase error is preserved as `.cause` for debugging.
      const wrapped = new CardReviewConstraintError(
        error.message ?? 'card_reviews insert failed',
        { code: error.code ?? '', rating: ratingNum, cardId: review.cardId },
      );
      (wrapped as any).cause = error;
      throw wrapped;
    }
  },
};

export default cardReviewsService;
