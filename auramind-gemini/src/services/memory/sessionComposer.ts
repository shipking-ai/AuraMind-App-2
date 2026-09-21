/**
 * sessionComposer — interleaving for study sessions.
 *
 * A queue composed only of due-now cards lets older material sit untouched for
 * weeks when its due date drifts past the days the user studies. This module
 * mixes a minority of "resurfaced" cards — pulled from OTHER decks whose FSRS
 * retrievability is in the spark band (fading, not forgotten) — into the due
 * queue at expanding gaps, so old material keeps reappearing mid-session.
 *
 * PURE MODULE: `now` and `rand` are injected; ordering is deterministic given
 * the inputs. Reviews that come out of this queue are recorded by the normal
 * study path — FSRS reschedules an early review from now, so no special
 * handling is needed for the interleaved reps.
 */

import { Card } from '../../types';
import { cardRetrievability } from './sparkScheduler';

/** Share of the final queue that may be resurfaced cards (0..1). */
export const RESURFACE_RATIO = 0.2;

/** Interleaving needs a real session to be worth it. */
export const MIN_QUEUE_SIZE = 6;

/** First resurfaced card appears after this many due cards. */
export const FIRST_GAP = 5;

/** Each subsequent gap grows by this many due cards. */
export const GAP_GROWTH = 2;

export interface ComposeOptions {
  now: number;
  /** Deck being studied; its cards are never "resurfaced" (they're already here). */
  currentDeckId?: string;
  /** Explicit exclusions (e.g. suspended decks). */
  excludeDeckIds?: string[];
  rand?: () => number;
}

/**
 * Compose a study queue: due-now cards in their natural order, with
 * resurfaced cards from other decks inserted at expanding gaps.
 *
 * - Resurfaced candidates: retrievability in the spark band, reviewed at least
 *   3 h ago, from a different deck than `currentDeckId`.
 * - Cap: floor(ratio × queue length) — a 10-card due queue gets 2 resurfaced.
 * - Fewer candidates than the cap → use what exists (never pad).
 * - Due queue shorter than MIN_QUEUE_SIZE → returned unchanged.
 */
export function composeSessionQueue(
  dueCards: Card[],
  allCards: Card[],
  { now, currentDeckId, excludeDeckIds = [], rand = Math.random }: ComposeOptions,
): { queue: Card[]; resurfacedIds: Set<string> } {
  const random = typeof rand === 'function' ? rand : Math.random;

  // Deterministic shuffle helper (Fisher–Yates with the injected rand).
  const shuffled = <T,>(arr: T[]): T[] => {
    const out = [...arr];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  const due = [...dueCards];
  if (due.length < MIN_QUEUE_SIZE) {
    return { queue: due, resurfacedIds: new Set() };
  }

  const excluded = new Set([...(currentDeckId ? [currentDeckId] : []), ...excludeDeckIds]);
  const dueIds = new Set(due.map((c) => c.id));

  const candidates = allCards.filter((c) => {
    if (excluded.has(c.deckId) || dueIds.has(c.id)) return false;
    if (!(c.lastReviewed && c.lastReviewed > 0)) return false;
    if (now - c.lastReviewed < 3 * 60 * 60 * 1000) return false;
    const r = cardRetrievability(c, now);
    return r >= 0.65 && r <= 0.90;
  });

  const cap = Math.floor(due.length * RESURFACE_RATIO);
  if (cap <= 0 || candidates.length === 0) {
    return { queue: due, resurfacedIds: new Set() };
  }

  // Weight candidates toward lowest retrievability, with jitter — same policy
  // as pop-up sparks, so all surfaces point at the same fading memories.
  const weighted = shuffled(candidates)
    .map((c) => ({
      card: c,
      w: Math.pow(0.95 - cardRetrievability(c, now), 2) * (0.7 + 0.6 * random()),
    }))
    .sort((a, b) => b.w - a.w)
    .slice(0, cap)
    .map((x) => x.card);

  // Insert at expanding gaps. The first gap SCALES with the queue so the
  // ratio cap is actually reachable: with cap insertions to place, the gaps
  // run base, base+GROWTH, base+2·GROWTH, … where
  // base = max(2, floor(due / (cap + 1)) - GAP_GROWTH). Fixed gaps would eat
  // the queue before the second insertion on anything shorter than ~25 due
  // cards, making the ratio a fiction. The gap counts DUE cards between
  // resurfaced cards, and an insertion only happens while the next gap can
  // still be HONORED — if the due queue is about to run out, the remaining
  // resurfaced cards are dropped rather than bunched at the tail.
  const resurfacedIds = new Set<string>();
  const queue: Card[] = [];
  let dueIdx = 0;
  // Base gap: spread cap insertions evenly-ish, but never below 2 due cards
  // and never above the spec's roomy FIRST_GAP default.
  const base = Math.max(2, Math.min(FIRST_GAP, Math.floor(due.length / (cap + 1)) - GAP_GROWTH));
  let nextGap = base;
  let resIdx = 0;

  while (dueIdx < due.length && resIdx < weighted.length) {
    const take = Math.min(nextGap, due.length - dueIdx);
    for (let i = 0; i < take; i++) queue.push(due[dueIdx++]);
    if (dueIdx < due.length) {
      // Due cards remain after this gap: place the next resurfaced card here.
      const card = weighted[resIdx++];
      resurfacedIds.add(card.id);
      queue.push(card);
      nextGap += GAP_GROWTH;
    }
    // else: due queue exhausted by this take — stop interleaving.
  }
  // Flush whatever due cards remain.
  while (dueIdx < due.length) queue.push(due[dueIdx++]);

  return { queue, resurfacedIds };
}
