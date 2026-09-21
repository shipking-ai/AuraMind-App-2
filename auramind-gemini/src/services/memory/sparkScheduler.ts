/**
 * sparkScheduler — the brain of memory sparks.
 *
 * FSRS schedules DUE work; sparks resurface cards BEFORE they come due, in the
 * band where recall is fading but retrieval still succeeds (retrievability
 * ≈ 0.65–0.90 by the FSRS forgetting curve). Firing is deliberately sporadic:
 * a jittered poll + a probability gate + daily caps + quiet hours, so sparks
 * feel like memory popping up on its own rather than a timer going off.
 *
 * PURE MODULE: every function takes `now` and (where randomness matters) `rand`
 * as parameters, so the whole policy is unit-testable without clock fakes.
 * The only side effects live in the explicitly-mutating log functions
 * (recordSpark / clearSparkLog), which mirror StudyModePage's fire-and-forget
 * persistence philosophy: a storage hiccup must never break a study flow.
 *
 * FSRS integrity: sparks surface cards for EARLY review. FSRS handles early
 * review by rescheduling from now (scheduleFSRS computes elapsed from
 * lastReview), so a spark review is just a normal review — no special state.
 */

import { Card } from '../../types';
import { calculateRetrievability, getFSRSState } from '../study/fsrs';

// ─── Policy constants (exported for tests + settings) ───────────────────────

/** Retrievability band: fading but not forgotten. */
export const SPARK_BAND_MIN = 0.65;
export const SPARK_BAND_MAX = 0.90;

/** Probability of firing on a given poll (polls are jittered ~90 s apart). */
export const SPARK_FIRE_PROBABILITY = 0.15;

/** Minimum gap between any two sparks, ms. */
export const MIN_SPARK_GAP_MS = 20 * 60 * 1000;

/** A card reviewed recently is suppressed from sparking, ms. */
export const MIN_REREVIEW_GAP_MS = 3 * 60 * 60 * 1000;

/** Max sparks per calendar day, all surfaces. */
export const DAILY_SPARK_CAP = 12;

/** Max times one card may be sparked per day. */
export const PER_CARD_DAILY_CAP = 2;

/** Default quiet hours (local time). */
export const DEFAULT_QUIET_START_HOUR = 22;
export const DEFAULT_QUIET_END_HOUR = 8;

/** Grace ramp width at each quiet-hours edge, minutes. */
export const QUIET_RAMP_MINUTES = 10;

// ─── Log ────────────────────────────────────────────────────────────────────

export type SparkSurface = 'popup' | 'notification' | 'interleave';

export interface SparkEvent {
  cardId: string;
  ts: number;
  surface: SparkSurface;
}

const SPARK_LOG_KEY = 'auramind:sparkLog';
const LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export function getSparkLog(): SparkEvent[] {
  try {
    const raw = localStorage.getItem(SPARK_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - LOG_RETENTION_MS;
    return parsed.filter(
      (e: SparkEvent) => e && typeof e.cardId === 'string' && Number.isFinite(e.ts) && e.ts > cutoff,
    );
  } catch {
    return [];
  }
}

/** Append one event and persist. Fire-and-forget safe: storage failures are swallowed. */
export function recordSpark(surface: SparkSurface, cardId: string, now: number = Date.now()): void {
  try {
    const log = getSparkLog().filter((e) => e.ts > now - LOG_RETENTION_MS);
    log.push({ cardId, ts: now, surface });
    localStorage.setItem(SPARK_LOG_KEY, JSON.stringify(log.slice(-500)));
  } catch {
    // Sparks are a convenience; never let a storage error interrupt a session.
  }
}

/**
 * Drop events of `surface` scheduled after `now`. Notification sparks are
 * logged at their fire time when planned; a re-plan cancels those
 * notifications, so their log entries must go too or every app launch would
 * stack another day's worth against the daily cap.
 */
export function dropPendingSparks(surface: SparkSurface, now: number = Date.now()): void {
  try {
    const log = getSparkLog();
    const kept = log.filter((e) => !(e.surface === surface && e.ts > now));
    if (kept.length !== log.length) localStorage.setItem(SPARK_LOG_KEY, JSON.stringify(kept));
  } catch {
    /* ignore */
  }
}

export function clearSparkLog(): void {
  try {
    localStorage.removeItem(SPARK_LOG_KEY);
  } catch {
    /* ignore */
  }
}

// ─── Preferences ────────────────────────────────────────────────────────────

export interface SparkPreferences {
  enabled: boolean;
  popupEnabled: boolean;
  notificationsEnabled: boolean;
  /** Local hour [0..23]. */
  quietStartHour: number;
  /** Local hour [0..23]. */
  quietEndHour: number;
}

export const DEFAULT_SPARK_PREFERENCES: SparkPreferences = {
  enabled: true,
  popupEnabled: true,
  notificationsEnabled: true,
  quietStartHour: DEFAULT_QUIET_START_HOUR,
  quietEndHour: DEFAULT_QUIET_END_HOUR,
};

// ─── Quiet hours ────────────────────────────────────────────────────────────

/** Scale factor in the grace ramp at a quiet-hours edge (0..1). */
function rampFactor(minutesIntoWindow: number): number {
  return Math.min(1, Math.max(0, minutesIntoWindow / QUIET_RAMP_MINUTES));
}

/**
 * True when `now` falls in quiet hours. Quiet hours may wrap midnight
 * (22:00 → 08:00) or not (e.g. 01:00 → 05:00). A start hour equal to the end
 * hour means "no quiet period".
 */
export function isQuietHour(now: number, prefs: SparkPreferences = DEFAULT_SPARK_PREFERENCES): boolean {
  const { quietStartHour: s, quietEndHour: e } = prefs;
  if (!Number.isFinite(s) || !Number.isFinite(e) || s === e) return false;
  const hour = new Date(now).getHours();
  if (s < e) return hour >= s && hour < e;
  return hour >= s || hour < e;
}

/**
 * Multiplicative gate for firing (0..1): 1 in full waking hours, 0 deep in
 * quiet hours, linear ramp across QUIET_RAMP_MINUTES at each edge. Keeps the
 * sporadic feel while making sparks fade out at bedtime instead of clipping.
 *
 * Works on a 1440-minute circle so wrapping (22:00→08:00) and non-wrapping
 * (01:00→05:00) windows are handled by the same arithmetic.
 */
export function fireGate(now: number, prefs: SparkPreferences = DEFAULT_SPARK_PREFERENCES): number {
  const { quietStartHour: s, quietEndHour: e } = prefs;
  if (!Number.isFinite(s) || !Number.isFinite(e) || s === e) return 1;

  const DAY = 24 * 60;
  const d = new Date(now);
  const m = d.getHours() * 60 + d.getMinutes();
  const startMin = s * 60;
  const endMin = e * 60;

  const inQuiet = s < e
    ? m >= startMin && m < endMin
    : m >= startMin || m < endMin;

  if (inQuiet) {
    // Minutes elapsed since quiet began (circular). Deep quiet → 0; the first
    // RAMP minutes after the boundary fade 1 → 0.
    const into = (m - startMin + DAY) % DAY;
    return into >= QUIET_RAMP_MINUTES ? 0 : rampFactor(QUIET_RAMP_MINUTES - into);
  }

  // Outside quiet: full rate, except fading in the RAMP minutes just before
  // quiet starts and just after it ends.
  const untilStart = (startMin - m + DAY) % DAY;
  const sinceEnd = (m - endMin + DAY) % DAY;
  return Math.min(
    untilStart >= QUIET_RAMP_MINUTES ? 1 : rampFactor(untilStart),
    sinceEnd >= QUIET_RAMP_MINUTES ? 1 : rampFactor(sinceEnd),
  );
}

// ─── Eligibility ────────────────────────────────────────────────────────────

export function cardRetrievability(card: Card, now: number): number {
  // Never-reviewed cards have no meaningful retrievability. getFSRSState's
  // SM-2 fallback would fabricate a positive stability for them (which makes
  // forgettingCurve(0, s) === 1); sparks exclude them anyway, but the helper
  // should not hand out a fake 1.0 either.
  if (!(card.lastReviewed && card.lastReviewed > 0)) return 0;
  const state = getFSRSState(card);
  const elapsedDays = state.lastReview > 0
    ? Math.max(0, (now - state.lastReview) / (24 * 60 * 60 * 1000))
    : 0;
  return calculateRetrievability({ ...state, elapsedDays });
}

/** A card is spark-eligible when it is in the fading band and not recently touched. */
export function isSparkEligible(card: Card, now: number, history: SparkEvent[]): boolean {
  // Studied at least once — new cards belong to the normal study flow.
  if (!(card.lastReviewed && card.lastReviewed > 0)) return false;
  if (now - card.lastReviewed < MIN_REREVIEW_GAP_MS) return false;

  const r = cardRetrievability(card, now);
  if (r < SPARK_BAND_MIN || r > SPARK_BAND_MAX) return false;

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const forCard = history.filter((e) => e.cardId === card.id);
  if (forCard.some((e) => e.ts > now - MIN_SPARK_GAP_MS)) return false;
  if (forCard.filter((e) => e.ts >= todayStart.getTime()).length >= PER_CARD_DAILY_CAP) {
    return false;
  }
  return true;
}

// ─── Caps + coin ────────────────────────────────────────────────────────────

/**
 * Whether a spark may fire at all right now: master switch, daily cap, and the
 * probability gate (scaled by the quiet-hours ramp). `rand` in [0,1).
 */
export function shouldFireNow(
  { now, history, prefs = DEFAULT_SPARK_PREFERENCES, rand }: {
    now: number;
    history: SparkEvent[];
    prefs?: SparkPreferences;
    rand?: () => number;
  },
): boolean {
  if (!prefs.enabled) return false;
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  if (history.filter((e) => e.ts >= todayStart.getTime()).length >= DAILY_SPARK_CAP) return false;
  // Global spacing: without it a dismissed spark could be followed by
  // another on the very next poll (~90 s), which reads as nagging.
  if (history.some((e) => e.ts > now - MIN_SPARK_GAP_MS && e.ts <= now)) return false;

  const gate = fireGate(now, prefs);
  if (gate <= 0) return false;
  const random = typeof rand === 'function' ? rand : Math.random;
  return random() < SPARK_FIRE_PROBABILITY * gate;
}

/**
 * Weighted pick among eligible cards: lowest retrievability (closest to
 * forgetting) dominates, jittered so the choice is not always the same card.
 */
export function pickSparkCard(
  cards: Card[],
  { now, history, rand, excludeDeckIds = [] as string[] }: {
    now: number;
    history: SparkEvent[];
    rand?: () => number;
    excludeDeckIds?: string[];
  },
): Card | null {
  const random = typeof rand === 'function' ? rand : Math.random;
  const eligible = cards.filter(
    (c) => !excludeDeckIds.includes(c.deckId) && isSparkEligible(c, now, history),
  );
  if (eligible.length === 0) return null;

  const weights = eligible.map((c) => {
    const r = cardRetrievability(c, now);
    return Math.pow(0.95 - r, 2) * (0.7 + 0.6 * random());
  });
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return eligible[Math.floor(random() * eligible.length)] ?? null;

  let roll = random() * total;
  for (let i = 0; i < eligible.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return eligible[i];
  }
  return eligible[eligible.length - 1];
}

/**
 * Cross-surface suppression: a card sparked on one surface today should not be
 * sent to another surface today. Used by the notification planner to skip
 * cards the pop-up already surfaced (and vice versa).
 */
export function cardsSparkedToday(now: number, history: SparkEvent[]): Set<string> {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  return new Set(history.filter((e) => e.ts >= todayStart.getTime()).map((e) => e.cardId));
}
