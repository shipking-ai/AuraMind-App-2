import { Card, Rating, SRSResult } from '../../types';
import { scheduleFSRS, fsrsToCardResult, createInitialFSRSState, getFSRSState } from './fsrs';

/**
 * FSRS (Free Spaced Repetition Scheduler) Algorithm - Primary SRS Engine
 *
 * FSRS v5 replaces SM-2 as the default algorithm. It provides up to 30% better
 * retention efficiency by modeling the forgetting curve with optimized parameters.
 *
 * Backward compatibility: Existing cards using SM-2 values are automatically
 * converted to FSRS state on first review.
 *
 * weightsOverride is an optional per-user tuned weight vector produced by
 * loadPersonalizedFsrs in ./fsrsAdaptation. When omitted the global defaults
 * are used and behaviour is identical to the previous single-arg form.
 */
export const calculateSRS = (
  card: Card,
  quality: Rating,
  weightsOverride?: number[],
  retentionOverride?: number,
): SRSResult & { fsrsState?: any } => {
  const fsrsResult = scheduleFSRS(card, quality, weightsOverride, retentionOverride);
  const cardResult = fsrsToCardResult(fsrsResult);

  return {
    interval: cardResult.interval,
    repetition: cardResult.repetition,
    easeFactor: cardResult.easeFactor,
    fsrsState: cardResult.fsrsState,
  };
};

export const getInitialCardState = (deckId: string, front: string, back: string): Card => {
  const _fsrsState = createInitialFSRSState();

  // FSRS initial interval is 0 (card is due immediately)
  // We set a small interval for the first review
  const initialInterval = 0;

  return {
    id: '',
    deckId,
    front,
    back,
    nextReview: Date.now(),
    interval: initialInterval,
    easeFactor: 2.5, // Default for backward compatibility
    repetition: 0,
  } as Card;
};

/**
 * Get the current FSRS state for a card (for analytics/debugging)
 */
export const getCardFSRSState = (card: Card) => {
  return getFSRSState(card);
};

/**
 * Check if a card has been migrated to FSRS
 */
export const isFSRSMigrated = (card: Card): boolean => {
  const fsrsState = (card as any).fsrsState;
  return fsrsState !== undefined && fsrsState.stability > 0;
};

/** The study setting "Conservative / Balanced / Aggressive" as a retention target. */
export const retentionFromSetting = (setting: string): number =>
  setting.startsWith('Conservative') ? 0.9 : setting.startsWith('Aggressive') ? 0.8 : 0.85;

/**
 * When each grade would bring this card back, in days, computed exactly as
 * grading will compute it. Drives the "comes back in…" labels on the grade
 * buttons, so the label and the schedule can never disagree.
 */
export const previewIntervals = (
  card: Card,
  weightsOverride?: number[],
  retention?: number,
): Record<Rating, number> => ({
  [Rating.AGAIN]: calculateSRS(card, Rating.AGAIN, weightsOverride, retention).interval,
  [Rating.HARD]: calculateSRS(card, Rating.HARD, weightsOverride, retention).interval,
  [Rating.GOOD]: calculateSRS(card, Rating.GOOD, weightsOverride, retention).interval,
  [Rating.EASY]: calculateSRS(card, Rating.EASY, weightsOverride, retention).interval,
});

/** "1d", "3w", "2mo", "1.5y" — a short label for an interval in days. */
export const formatInterval = (days: number): string => {
  if (!Number.isFinite(days) || days <= 0) return 'now';
  if (days < 1) return `${Math.max(1, Math.round(days * 24 * 60))}m`;
  if (days < 14) return `${Math.round(days)}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
};
