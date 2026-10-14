import type { ProfLinneaMood } from '../components/chat/ProfLinnea';

export interface MoodInputs {
  /** Current consecutive-day study streak (0 if unknown). */
  streakCount?: number;
  /** Epoch milliseconds of last study activity. */
  lastActivityAt?: number;
  /** Override "now" for tests. Defaults to Date.now(). */
  now?: number;
  /**
   * Performance-aware inputs (all optional so the hook stays safe even
   * while upstream metrics are still loading — undefined inputs MUST
   * NOT drag mood toward 'focused' per design review F).
   */
  /** Cards remaining in today's due queue. */
  dueCards?: number;
  /** 7-day rolling accuracy in 0..1. */
  accuracyRate?: number;
  /** Average review latency ms (high = struggling). */
  avgLatencyMs?: number;
}

/** How long of a gap before mood flips to "focused". */
const FOCUSED_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
/** Streak length that earns "encouraging". */
const ENCOURAGING_AT = 3;
/** Below this rolling accuracy, Prof. Linnea nudges 'focused' even on hot streaks. */
const STRUGGLING_ACCURACY = 0.55;
/** Above this latency ms, Prof. Linnea leans into 'focused'. */
const STRUGGLING_LATENCY_MS = 8_000;

/**
 * Pure derivation from app state → Prof. Linnea's mood.
 *
 *  - encouraging when streakCount >= 3 (with no struggling signal)
 *  - focused   when there's been a long break (>= 7 days), accuracy is
 *              below the struggling threshold, or recent latency is high
 *  - default   otherwise
 *
 * Performance-aware inputs are optional: undefined (still loading) keeps
 * the streak/recency-derived mood rather than silently forcing 'focused'.
 * A debounce is the caller's responsibility (study cards flip accuracy
 * cycle every few seconds; ProfLinnea mood should ignore micro-flickers).
 */
export function deriveMoodForProfLinnea(input: MoodInputs): ProfLinneaMood {
  const now = input.now ?? Date.now();
  const last = input.lastActivityAt;

  // Performance-aware nudges take priority over a healthy streak:
  // if the user's accuracy is genuinely poor or they're slow to answer,
  // we don't want to look encouraging — that erodes trust.
  if (typeof input.accuracyRate === 'number' && input.accuracyRate < STRUGGLING_ACCURACY) {
    return 'focused';
  }
  if (typeof input.avgLatencyMs === 'number' && input.avgLatencyMs > STRUGGLING_LATENCY_MS) {
    return 'focused';
  }

  // Returning from a gap → focused, regardless of streak history.
  if (typeof last === 'number' && now - last >= FOCUSED_AFTER_MS) {
    return 'focused';
  }
  // Hot streak → encouraging.
  if ((input.streakCount ?? 0) >= ENCOURAGING_AT) {
    return 'encouraging';
  }
  return 'default';
}

/** React hook wrapper that re-derives on every render but never subscribes. */
export function useMoodForProfLinnea(inputs: MoodInputs): ProfLinneaMood {
  return deriveMoodForProfLinnea(inputs);
}

export default useMoodForProfLinnea;
