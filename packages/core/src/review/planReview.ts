/**
 * One rating, one plan: the card's new schedule plus the review-log record.
 * The website's rateCard() and the native app's study session both build
 * their writes from this, so the two can never schedule a card differently.
 */
import type { Card, FSRSState, SRSResult } from '../types';
import { Rating } from '../types';
import { applyPersonalizedDifficultyInit } from '../scheduling/fsrs';
import { calculateSRS, retentionFromSetting } from '../scheduling/srs';
import { msToIso } from '../time';

const DAY_MS = 86_400_000;

/** The website's default study setting, 'Balanced - 85%'. */
export const DEFAULT_TARGET_RETENTION = retentionFromSetting('Balanced - 85%');

/** What the website's study screen schedules with (StudyModePage.handleRate). */
export interface ScheduleOptions {
  weightsOverride?: number[];
  retention?: number;
  profileLabel?: string | null;
  pacingTarget?: number;
}

export interface CardScheduleUpdate {
  interval: number;
  repetition: number;
  easeFactor: number;
  nextReview: number;
  lastReviewed: number;
  fsrsState?: FSRSState;
}

export interface ReviewRecord {
  cardId: string;
  rating: Rating;
  reviewedAt: number;
  srsResult: SRSResult;
}

export function planReview(
  card: Card,
  rating: Rating,
  reviewedAt: number,
  opts?: ScheduleOptions,
): { update: CardScheduleUpdate; record: ReviewRecord } {
  // A first review carries the user's personalized difficulty bias, exactly
  // as the website applies it; later reviews pass through unchanged.
  const base = opts?.profileLabel || opts?.pacingTarget !== undefined
    ? applyPersonalizedDifficultyInit(card, opts.profileLabel ?? null, opts.weightsOverride, opts.pacingTarget).card
    : card;
  const srsResult = calculateSRS(base, rating, opts?.weightsOverride, opts?.retention);
  const update: CardScheduleUpdate = {
    interval: srsResult.interval,
    repetition: srsResult.repetition,
    easeFactor: srsResult.easeFactor,
    nextReview: reviewedAt + srsResult.interval * DAY_MS,
    lastReviewed: reviewedAt,
  };
  if (srsResult.fsrsState) update.fsrsState = srsResult.fsrsState;
  return { update, record: { cardId: card.id, rating, reviewedAt, srsResult } };
}

/** The `cards` columns a schedule update writes (TIMESTAMPTZ as ISO). */
export function toCardScheduleRow(u: CardScheduleUpdate): {
  interval: number;
  repetition: number;
  ease_factor: number;
  next_review: string;
  last_reviewed: string;
  fsrs_state?: FSRSState;
} {
  const row: ReturnType<typeof toCardScheduleRow> = {
    interval: u.interval,
    repetition: u.repetition,
    ease_factor: u.easeFactor,
    next_review: msToIso(u.nextReview),
    last_reviewed: msToIso(u.lastReviewed),
  };
  if (u.fsrsState) row.fsrs_state = u.fsrsState;
  return row;
}
