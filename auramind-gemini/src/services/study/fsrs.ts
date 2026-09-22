/**
 * FSRS (Free Spaced Repetition Scheduler) — scheduling for every review.
 *
 * The math is the official implementation, `ts-fsrs` (FSRS-6), used in
 * long-term mode: intervals are whole days, matching the `cards.interval`
 * INTEGER column, and "Again" brings a card back the next day.
 *
 * Why not our own formulas any more: the previous hand-written version
 * mis-mapped grades and used a weight as the forgetting-curve factor, which
 * made intervals ~140x too long: "Hard" could schedule a card 100 years out
 * and "Good" several years. Tests pin the corrected behaviour.
 *
 * Key concepts:
 * - Stability (S): days until recall probability falls to 90%
 * - Difficulty (D): 1-10, how hard the card is for this learner
 * - Retrievability (R): probability of recall right now
 * - Target retention: the recall probability reviews are scheduled at
 *
 * Reference: https://github.com/open-spaced-repetition/ts-fsrs
 */

import {
  State,
  Rating as FsrsRating,
  createEmptyCard,
  default_w,
  forgetting_curve,
  fsrs,
  generatorParameters,
  type Card as FsrsCard,
  type Grade,
} from 'ts-fsrs';
import { Card, Rating } from '../../types';

/**
 * The FSRS-6 parameters the scheduler uses (the published defaults).
 */
export const FSRS_PARAMETERS: readonly number[] = default_w;

/**
 * The 20-number vector the personal-profile tuner (fsrsAdaptation) was built
 * on. It belongs to the old, incorrect model, so the scheduler no longer
 * applies it: scheduleFSRS only accepts a full FSRS-6 parameter vector.
 * Kept under its historical name so the profile/catalog code and its stored
 * rows keep working until the tuner is rebuilt on the FSRS-6 optimizer.
 */
export const DEFAULT_WEIGHTS: number[] = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0659,
  0.0234, 1.616, 0.1544, 0.6621, 1.0, 0.8, 0.2, 0.05,
  0.1, 0.7, 0.2, 2.5, 0.3
];

const DEFAULT_RETENTION = 0.9;
const MAXIMUM_INTERVAL = 36500;
const DAY_MS = 24 * 60 * 60 * 1000;

// FSRS card state
export interface FSRSCardState {
  stability: number;    // Memory stability in days
  difficulty: number;   // Card difficulty (1-10 scale)
  elapsedDays: number;  // Days since last review
  scheduledDays: number;// Days until next review
  repetitions: number;  // Consecutive successful reviews (resets on Again)
  lapses: number;       // Number of times forgotten
  lastReview: number;   // Timestamp of last review
}

// FSRS scheduling result
export interface FSRSScheduleResult {
  stability: number;
  difficulty: number;
  interval: number;      // Days until next review (whole days, >= 1)
  retrievability: number;// Recall probability at the moment of this review
  repetitions: number;
  lapses: number;
}

/** App rating (0/3/4/5) to FSRS grade (Again/Hard/Good/Easy). */
const RATING_TO_GRADE: Record<number, Grade> = {
  [Rating.AGAIN]: FsrsRating.Again,
  [Rating.HARD]: FsrsRating.Hard,
  [Rating.GOOD]: FsrsRating.Good,
  [Rating.EASY]: FsrsRating.Easy,
};

/**
 * Recall probability after `elapsedDays` for a memory of `stability` days,
 * on the FSRS-6 forgetting curve (R = 0.9 when elapsed === stability).
 *
 * Exported so downstream simulators (e.g. profileSimulator) can reuse the
 * exact same shape without copying the formula. `_factor` is accepted for
 * compatibility and ignored.
 */
export function forgettingCurve(elapsedDays: number, stability: number, _factor?: number): number {
  if (stability <= 0) return 0;
  return forgetting_curve(FSRS_PARAMETERS, Math.max(0, elapsedDays), stability);
}

/**
 * Inverse of forgettingCurve: how many days after a review recall has fallen
 * to `retrievability` for a memory of `stability` days.
 */
export function elapsedForRetrievability(retrievability: number, stability: number): number {
  const decay = -FSRS_PARAMETERS[20];
  const factor = Math.pow(0.9, 1 / decay) - 1;
  return (stability / factor) * (Math.pow(retrievability, 1 / decay) - 1);
}

/**
 * Get FSRS state from a Card object
 * Falls back to SM-2 derived values if FSRS state is not available
 */
export function getFSRSState(card: Card): FSRSCardState {
  // Check if card has FSRS-specific fields
  const fsrsState = (card as any).fsrsState as FSRSCardState | undefined;

  if (fsrsState && fsrsState.stability > 0) {
    return fsrsState;
  }

  // Convert from SM-2 state to FSRS state. An SM-2 interval is roughly the
  // time to ~90% recall, which is what FSRS stability means.
  const easeFactor = card.easeFactor || 2.5;
  const interval = card.interval || 0;
  const repetition = card.repetition || 0;
  const estimatedStability = repetition > 0 ? Math.max(0.5, interval) : 0;

  // SM-2 ease factor 2.5 maps to FSRS difficulty ~5 (middle)
  const estimatedDifficulty = Math.max(1, Math.min(10, 10 - (easeFactor - 1.3) * 4));

  const elapsedDays = card.lastReviewed
    ? Math.max(0, (Date.now() - card.lastReviewed) / DAY_MS)
    : 0;

  return {
    stability: estimatedStability,
    difficulty: estimatedDifficulty,
    elapsedDays,
    scheduledDays: interval,
    repetitions: repetition,
    lapses: card.lapses ?? 0,
    lastReview: card.lastReviewed || 0,
  };
}

/** Our stored state as a ts-fsrs card. Never-reviewed cards start empty. */
function toFsrsCard(card: Card, now: Date): FsrsCard {
  const state = getFSRSState(card);
  const reviewed = state.lastReview > 0 && state.stability > 0;
  if (!reviewed) return createEmptyCard(now);
  const lastReview = new Date(state.lastReview);
  return {
    due: new Date(card.nextReview ?? state.lastReview + state.scheduledDays * DAY_MS),
    stability: Math.min(MAXIMUM_INTERVAL, state.stability),
    difficulty: Math.max(1, Math.min(10, state.difficulty)),
    elapsed_days: Math.max(0, Math.floor((now.getTime() - lastReview.getTime()) / DAY_MS)),
    scheduled_days: Math.max(0, Math.round(state.scheduledDays)),
    learning_steps: 0,
    reps: Math.max(1, state.repetitions),
    lapses: state.lapses,
    state: State.Review,
    last_review: lastReview,
  };
}

/**
 * Calculate retrievability at current time
 */
export function calculateRetrievability(state: FSRSCardState): number {
  if (state.stability <= 0 || state.elapsedDays < 0) return 0;
  return forgettingCurve(state.elapsedDays, state.stability);
}

function isFsrs6Parameters(weights: number[] | undefined): weights is number[] {
  return (
    Array.isArray(weights) &&
    weights.length === FSRS_PARAMETERS.length &&
    weights.every((w) => Number.isFinite(w))
  );
}

/**
 * Main FSRS scheduling function
 * Takes a card and rating, returns new FSRS state and interval
 *
 * `weightsOverride` is used only when it is a complete FSRS-6 parameter
 * vector; anything else (e.g. the legacy 20-number profile weights) falls
 * back to the published defaults.
 */
export function scheduleFSRS(
  card: Card,
  rating: Rating,
  weightsOverride?: number[],
  retentionOverride?: number,
): FSRSScheduleResult {
  const requestRetention = Number.isFinite(retentionOverride)
    ? Math.min(0.99, Math.max(0.7, retentionOverride as number))
    : DEFAULT_RETENTION;
  const scheduler = fsrs(
    generatorParameters({
      request_retention: requestRetention,
      maximum_interval: MAXIMUM_INTERVAL,
      w: isFsrs6Parameters(weightsOverride) ? weightsOverride : FSRS_PARAMETERS,
      enable_fuzz: false,
      enable_short_term: false,
    }),
  );

  const now = new Date();
  const before = toFsrsCard(card, now);
  const grade = RATING_TO_GRADE[rating] ?? FsrsRating.Good;
  const retrievability = before.state === State.New
    ? 0
    : scheduler.get_retrievability(before, now, false);
  const { card: after } = scheduler.next(before, now, grade);

  // A personalised starting difficulty (applyPersonalizedDifficultyInit)
  // nudges a brand-new card's first difficulty halfway toward that target.
  const previous = (card as any).fsrsState as FSRSCardState | undefined;
  let difficulty = after.difficulty;
  if (before.state === State.New && previous && previous.repetitions === 0 && previous.difficulty > 0) {
    difficulty = (after.difficulty + previous.difficulty) / 2;
  }

  const priorStreak = getFSRSState(card).repetitions;
  return {
    stability: Math.max(0.1, after.stability),
    difficulty: Math.max(1, Math.min(10, difficulty)),
    interval: Math.max(1, Math.min(MAXIMUM_INTERVAL, Math.round(after.scheduled_days))),
    retrievability: Math.max(0, Math.min(1, retrievability)),
    repetitions: grade === FsrsRating.Again ? 0 : priorStreak + 1,
    lapses: after.lapses,
  };
}

/**
 * Create initial FSRS state for a new card
 */
export function createInitialFSRSState(): FSRSCardState {
  return {
    stability: 0,
    difficulty: DEFAULT_WEIGHTS[4], // Starting difficulty target
    elapsedDays: 0,
    scheduledDays: 0,
    repetitions: 0,
    lapses: 0,
    lastReview: 0,
  };
}

/**
 * Per-profile initial difficulty center (FSRS W[4] mean-reversion target).
 *
 * FSRS mean-reverts card.difficulty toward `W[4]` (~7.21) over time. By
 * picking a different per-user center we bias every NEW card and every
 * card on its first personalized review, so a tough-learner doesn't open
 * a fast-learner's pacing curve and feel punished.
 *
 * Values are hand-fit to the (avgStability, lapseRate, retention) features
 * already driving catalog lookup. Single source of truth for both the
 * DifficultyChip copy (in fsrsAdaptation) and the actual bias applied
 * to cards here.
 */
export const PROFILE_DIFFICULTY_CENTER: Readonly<Record<string, number>> = {
  aggressive: 7,
  moderate: 6.5,
  conservative: 5,
  'fast-learner': 4.5,
  'tough-learner': 7.5,
  'visual-dominant': 5.5,
};

/**
 * Apply the personalized difficulty center to a card whose initial state has
 * not yet been exercised by the user.
 *
 * Idempotent: cards whose `fsrsState.repetitions > 0` (already reviewed at
 * least once under the personal schedule) are returned untouched. Cards
 * whose existing `fsrsState.difficulty` is already close to a known center
 * are also returned untouched, so calling this on every review is cheap.
 *
 * The optional fourth arg `difficultyTargetOverride` lets per-session pacing
 * controls swap the profile-derived target for an explicit number without
 * having to manufacture a synthetic profile label.
 *
 * Returns a new card object with the bias applied and an `applied` flag so
 * callers can decide whether to persist (dbService.updateCard) or run the
 * schedule inline.
 */
export function applyPersonalizedDifficultyInit(
  card: Card,
  profileLabel: string | null,
  weightsOverride?: number[],
  difficultyTargetOverride?: number,
): { card: Card; applied: boolean } {
  // Already mid-life — don't perturb a card the user has started studying
  // under the existing curve.
  if (card.fsrsState && card.fsrsState.repetitions > 0) {
    return { card, applied: false };
  }
  const resolvedOverride = difficultyTargetOverride !== undefined
    ? Math.max(1, Math.min(10, difficultyTargetOverride))
    : null;
  // Note: `profileLabel && ...` used to leak an empty string through the
  // `??` chain (`""` is not nullish), which set `difficulty` to `""` and
  // silently corrupted the FSRS state for cards with a blank profile
  // label. Resolve to `undefined` explicitly so `??` can do its job.
  const profileCenter = profileLabel ? PROFILE_DIFFICULTY_CENTER[profileLabel] : undefined;
  const targetDifficulty = resolvedOverride ?? profileCenter ?? DEFAULT_WEIGHTS[4];
  // If existing fsrs_state already has exactly the personalized center, skip
  // a no-op write.
  if (card.fsrsState && Math.abs(card.fsrsState.difficulty - targetDifficulty) < 0.0001) {
    return { card, applied: false };
  }
  const baseInit = createInitialFSRSState();
  const personalizedInit: FSRSCardState = {
    ...(card.fsrsState ?? baseInit),
    difficulty: targetDifficulty,
    stability: weightsOverride?.[0] ?? baseInit.stability,
  };
  return {
    card: { ...card, fsrsState: personalizedInit },
    applied: true,
  };
}

/**
 * Convert FSRS result to Card-compatible SRS values
 * This ensures backward compatibility with the existing Card interface
 */
export function fsrsToCardResult(result: FSRSScheduleResult): {
  interval: number;
  easeFactor: number;
  repetition: number;
  fsrsState: FSRSCardState;
} {
  // Convert FSRS stability/difficulty back to SM-2 ease factor for compatibility
  // This allows the existing UI and database to work without changes
  const easeFactor = Math.max(1.3, 1.3 + (10 - result.difficulty) * 0.12);
  
  const fsrsState: FSRSCardState = {
    stability: result.stability,
    difficulty: result.difficulty,
    elapsedDays: 0,
    scheduledDays: result.interval,
    repetitions: result.repetitions,
    lapses: result.lapses,
    lastReview: Date.now(),
  };
  
  return {
    interval: result.interval,
    easeFactor: Math.round(easeFactor * 100) / 100,
    repetition: result.repetitions,
    fsrsState,
  };
}

/**
 * Predict retention rate for a given interval
 */
export function predictRetention(stability: number, intervalDays: number): number {
  return forgettingCurve(intervalDays, stability);
}

/**
 * Days until recall falls to `targetRetention` for a memory of `stability`.
 */
export function optimalInterval(stability: number, targetRetention: number = 0.9): number {
  const scheduler = fsrs(
    generatorParameters({ request_retention: targetRetention, enable_short_term: false }),
  );
  return Math.max(1, scheduler.next_interval(stability, 0));
}

/**
 * Get FSRS analytics for a set of cards
 */
export interface FSRSAnalytics {
  totalCards: number;
  matureCards: number;     // stability > 21 days
  youngCards: number;      // stability <= 21 days
  newCards: number;        // never reviewed
  averageStability: number;
  averageDifficulty: number;
  averageRetrievability: number;
  predictedRetention: number;
  cardsDueToday: number;
  cardsDueThisWeek: number;
  cardsDueThisMonth: number;
}

export function getFSRSAnalytics(cards: Card[]): FSRSAnalytics {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  
  let totalCards = 0;
  let matureCards = 0;
  let youngCards = 0;
  let newCards = 0;
  let totalStability = 0;
  let totalDifficulty = 0;
  let totalRetrievability = 0;
  let cardsDueToday = 0;
  let cardsDueThisWeek = 0;
  let cardsDueThisMonth = 0;
  
  for (const card of cards) {
    const state = getFSRSState(card);
    totalCards++;
    
    if (state.repetitions === 0) {
      newCards++;
    } else if (state.stability > 21) {
      matureCards++;
    } else {
      youngCards++;
    }
    
    totalStability += state.stability;
    totalDifficulty += state.difficulty;
    
    const retrievability = calculateRetrievability(state);
    totalRetrievability += retrievability;
    
    // Check due status
    const nextReview = card.nextReview || 0;
    if (nextReview <= now) {
      cardsDueToday++;
    } else if (nextReview <= now + 7 * dayMs) {
      cardsDueThisWeek++;
    } else if (nextReview <= now + 30 * dayMs) {
      cardsDueThisMonth++;
    }
  }
  
  return {
    totalCards,
    matureCards,
    youngCards,
    newCards,
    averageStability: totalCards > 0 ? totalStability / totalCards : 0,
    averageDifficulty: totalCards > 0 ? totalDifficulty / totalCards : 0,
    averageRetrievability: totalCards > 0 ? totalRetrievability / totalCards : 0,
    predictedRetention: totalCards > 0 ? totalRetrievability / totalCards : 0,
    cardsDueToday,
    cardsDueThisWeek,
    cardsDueThisMonth,
  };
}



