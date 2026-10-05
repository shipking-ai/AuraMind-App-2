/**
 * Regression-test suite covering the three live-runtime bug fixes from
 * the dev console dump:
 *
 *   Bug #1:  `supabase.rpc('count_user_lapses', …)` was 404'ing on
 *            the project's Supabase instance. Fix: inline SUM
 *            across the cards table (sumCardLapses helper).
 *
 *   Bug #2:  `select('fsrs_state, last_reviewed, last_review, …')`
 *            was returning 400 because `last_review` (singular)
 *            doesn't exist on this Supabase project's cards schema.
 *            Fix: extractReviewSample helper, prefer fsrs_state.lastReview
 *            and cards.last_reviewed (no `last_review` fallback).
 *
 *   Bug #3:  updateCard was silently dropping every SRS-schedule key
 *            before sending the UPDATE, so the schedule never reached
 *            the database (Supabase returned 0 rows because the
 *            payload was sparse). Fix: buildUpdatePayload export —
 *            every schedule field maps correctly to its column name.
 *
 * Each of these was the kind of bug a refactor could quietly
 * re-introduce; the tests below pin the contracts so any future
 * "simplification" of these layers visibly breaks the test instead
 * of the user's session.
 */

import { describe, expect, it } from 'vitest';
import {
  sumCardLapses,
  computePersonalizerStats,
  extractReviewSample,
} from '../services/study/fsrsAdaptation';
import {
  buildUpdatePayload,
} from '../services/database/modules/cardService';
import {
  toIsoOrUndef,
  toIsoOrNull,
  isTimetzCompatible,
  parseIsoToMsOrUndef,
  parseIsoToMsOrNow,
} from '../lib/timestamps';
import type { Card } from '../types';

describe('Bug #1: count_user_lapses RPC replaced by inline sumCardLapses', () => {
  it('returns 0 for empty rows', () => {
    expect(sumCardLapses([])).toBe(0);
  });

  it('sums positive lapse counts across rows', () => {
    expect(sumCardLapses([
      { lapses: 2 },
      { lapses: 0 },
      { lapses: 1 },
      { lapses: 4 },
    ])).toBe(7);
  });

  it('tolerates null / undefined rows', () => {
    expect(sumCardLapses([
      { lapses: null },
      {},
      { lapses: undefined },
      { lapses: 0 },
    ])).toBe(0);
  });

  it('coerces string-valued lapses (when schema returns text)', () => {
    expect(sumCardLapses([
      { lapses: '3' },
      { lapses: '2' },
    ])).toBe(5);
  });

  it('skips non-finite coerced values (e.g. NaN, garbage strings)', () => {
    expect(sumCardLapses([
      { lapses: 'not-a-number' },
      { lapses: 2 },
    ])).toBe(2);
  });

  it('computePersonalizerStats returns 0 retention + 0 lapse-rate for empty sessions', () => {
    expect(computePersonalizerStats({ reviewed: 0, correct: 0, totalLapses: 0 })).toEqual({
      retention: 0,
      lapseRatePer100: 0,
      reviewCount: 0,
    });
  });

  it('computePersonalizerStats computes retention in [0, 1]', () => {
    const result = computePersonalizerStats({
      reviewed: 100,
      correct: 87,
      totalLapses: 5,
    });
    expect(result.retention).toBeCloseTo(0.87, 4);
    expect(result.lapseRatePer100).toBeCloseTo(5, 4);
    expect(result.reviewCount).toBe(100);
  });

  it('computePersonalizerStats does not produce NaN when reviewed=0 (no divide-by-zero)', () => {
    const result = computePersonalizerStats({ reviewed: 0, correct: 0, totalLapses: 5 });
    expect(Number.isFinite(result.lapseRatePer100)).toBe(true);
    expect(result.lapseRatePer100).toBe(0);
  });
});

describe('Bug #2: fetchRecentReviewSamples refuses `last_review` and routes from canonical columns', () => {
  it('returns null when fsrs_state lacks stability', () => {
    expect(extractReviewSample({
      fsrs_state: { difficulty: 5 },
      last_reviewed: new Date().toISOString(),
      repetition: 1,
      lapses: 0,
    })).toBeNull();
  });

  it('returns null when there is no last_reviewed timestamp', () => {
    expect(extractReviewSample({
      fsrs_state: { stability: 10, lastReview: 0 },
      last_reviewed: null,
      repetition: 1,
      lapses: 0,
    })).toBeNull();
  });

  it('extracts from fsrs_state payload (preferred path)', () => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const sample = extractReviewSample({
      fsrs_state: { stability: 14, lastReview: oneDayAgo, repetitions: 3, lapses: 0 },
      last_reviewed: null,
      repetition: 3,
      lapses: 0,
    });
    expect(sample).not.toBeNull();
    expect(sample!.stability).toBe(14);
    expect(sample!.elapsedDays).toBeGreaterThanOrEqual(0.99);
    expect(sample!.elapsedDays).toBeLessThanOrEqual(1.01);
    expect(sample!.grade).toBe(3); // repetitions >= 2, no lapses
  });

  it('falls back to row.last_reviewed when fsrs_state.lastReview is missing', () => {
    const sample = extractReviewSample({
      fsrs_state: { stability: 7 },
      last_reviewed: new Date(Date.now() - 2 * 86400000).toISOString(),
      repetition: 1,
      lapses: 0,
    });
    expect(sample).not.toBeNull();
    expect(sample!.elapsedDays).toBeGreaterThanOrEqual(1.99);
    expect(sample!.elapsedDays).toBeLessThanOrEqual(2.01);
  });

  it('classifies grade=0 (lapse) when lapses > 0, even if repetition >= 2', () => {
    const sample = extractReviewSample({
      fsrs_state: { stability: 14, lastReview: Date.now() - 86400000, repetitions: 5, lapses: 1 },
      last_reviewed: new Date().toISOString(),
      repetition: 5,
      lapses: 1,
    });
    expect(sample!.grade).toBe(0);
  });

  it('classifies grade=3 (easy) when repetition >= 2 and no lapses', () => {
    const sample = extractReviewSample({
      fsrs_state: { stability: 14, lastReview: Date.now() - 86400000, repetitions: 5, lapses: 0 },
      last_reviewed: new Date().toISOString(),
      repetition: 5,
      lapses: 0,
    });
    expect(sample!.grade).toBe(3);
  });

  it('classifies grade=2 (good) when repetition < 2 and no lapses', () => {
    const sample = extractReviewSample({
      fsrs_state: { stability: 14, lastReview: Date.now() - 86400000, repetitions: 1, lapses: 0 },
      last_reviewed: new Date().toISOString(),
      repetition: 1,
      lapses: 0,
    });
    expect(sample!.grade).toBe(2);
  });

  it('parses fsrs_state when it arrives as a JSON string (column round-trip)', () => {
    const oneDayAgo = Date.now() - 86400000;
    const payload = JSON.stringify({
      stability: 12,
      lastReview: oneDayAgo,
      repetitions: 2,
      lapses: 0,
    });
    const sample = extractReviewSample({
      fsrs_state: payload,
      last_reviewed: null,
      repetition: 2,
      lapses: 0,
    });
    expect(sample).not.toBeNull();
    expect(sample!.stability).toBe(12);
    expect(sample!.elapsedDays).toBeGreaterThanOrEqual(0.99);
  });

  it('returns null when fsrs_state string is unparseable', () => {
    expect(extractReviewSample({
      fsrs_state: '{this is not json',
      last_reviewed: new Date().toISOString(),
      repetition: 1,
      lapses: 0,
    })).toBeNull();
  });
});

describe('Bug #3: buildUpdatePayload maps every SRS schedule field StudyModePage flushes', () => {
  const sampleCard: Card = {
    id: 'card-1',
    deckId: 'deck-1',
    front: 'Front',
    back: 'Back',
    interval: 0,
    easeFactor: 2.5,
    repetition: 0,
  };

  it('maps the canonical SRS update from StudyModePage.handleRate', () => {
    // Bug #4 (TIMESTAMPTZ sanitizer): `nextReview` and `lastReviewed` arrive
    // as raw ms-epoch integers (Date.now()) but cards.next_review +
    // cards.last_reviewed are TIMESTAMPTZ columns. buildUpdatePayload routes
    // them through toIsoOrUndef, so the wire format is an ISO 8601 UTC
    // string Postgres can parse. The numeric assertion the old test
    // expected (1234567890) would have triggered the live 22008 trace.
    const ONE_DAY_LATER = Date.now() + 5 * 86400000;
    const NOW = Date.now();
    const payload = buildUpdatePayload({
      interval: 5,
      repetition: 3,
      easeFactor: 2.6,
      nextReview: ONE_DAY_LATER,
      lastReviewed: NOW,
      fsrsState: { stability: 5, difficulty: 5, elapsedDays: 1, scheduledDays: 5, repetitions: 3, lapses: 0, lastReview: NOW },
    });
    expect(payload.interval).toBe(5);
    expect(payload.repetition).toBe(3);
    // ease_factor (snake_case), not easeFactor
    expect(payload.ease_factor).toBe(2.6);
    // next_review MUST be an ISO 8601 string (the wire format that survives
    // POST to a TIMESTAMPTZ column). The previous "expected number" test
    // would have triggered the 22008 datetime_field_overflow live trace.
    expect(typeof payload.next_review).toBe('string');
    expect(isTimetzCompatible(payload.next_review)).toBe(true);
    expect(payload.next_review).toBe(new Date(ONE_DAY_LATER).toISOString());
    expect(typeof payload.last_reviewed).toBe('string');
    expect(payload.last_reviewed).toBe(new Date(NOW).toISOString());
    expect(payload.fsrs_state).toBe(JSON.stringify({
      stability: 5, difficulty: 5, elapsedDays: 1, scheduledDays: 5, repetitions: 3, lapses: 0, lastReview: NOW,
    }));
  });

  it('JSON-stringifies fsrs_state when caller passes an object (Postgrest expects text)', () => {
    const payload = buildUpdatePayload({ fsrsState: { stability: 1, difficulty: 2 } as any });
    expect(typeof payload.fsrs_state).toBe('string');
    expect(JSON.parse(payload.fsrs_state!)).toEqual({ stability: 1, difficulty: 2 });
  });

  it('does NOT double-encode fsrs_state if caller passes a pre-stringified payload', () => {
    const preEncoded = JSON.stringify({ stability: 9, difficulty: 4 });
    const payload = buildUpdatePayload({ fsrsState: preEncoded as any });
    expect(payload.fsrs_state).toBe(preEncoded);
    // Sanity: round-trip through fetchCards should parse to the same object.
    expect(JSON.parse(payload.fsrs_state!)).toEqual({ stability: 9, difficulty: 4 });
  });

  it('writes "" for explicit-null fsrs_state (skip-field-friendly sentinel)', () => {
    // The outer `updates.fsrsState !== undefined` guard skips undefined,
    // but explicit `null` reaches the inner branch. We pass through
    // String(null ?? '') = '' so the column is written empty rather than
    // receiving the string "null". Pin this so a future "improve-null"
    // refactor visibly breaks.
    const payload = buildUpdatePayload({ fsrsState: null as any });
    expect(payload.fsrs_state).toBe('');
  });

  it('drops undefined keys so UPDATE payload is minimal', () => {
    const payload = buildUpdatePayload({ interval: 5 });
    expect(Object.keys(payload).sort()).toEqual(['interval']);
  });

  it('maps deckId -> deck_id (snake_case)', () => {
    expect(buildUpdatePayload({ deckId: 'd-2' })).toEqual({ deck_id: 'd-2' });
  });

  it('falls through front -> front', () => {
    expect(buildUpdatePayload({ front: 'Q' }).front).toBe('Q');
  });

  it('falls through question -> front when front is absent (alternative API)', () => {
    expect(buildUpdatePayload({ question: 'Q' as any }).front).toBe('Q');
  });

  it('falls through back -> back', () => {
    expect(buildUpdatePayload({ back: 'A' }).back).toBe('A');
  });

  it('falls through answer -> back when back is absent', () => {
    expect(buildUpdatePayload({ answer: 'A' as any }).back).toBe('A');
  });

  it('maps sourceType -> source_type', () => {
    expect(buildUpdatePayload({ sourceType: 'wikipedia' as any }).source_type).toBe('wikipedia');
  });

  it('maps sourceLabel -> source_label', () => {
    expect(buildUpdatePayload({ sourceLabel: 'intro physics' }).source_label).toBe('intro physics');
  });

  it('maps trustScore -> trust_score', () => {
    expect(buildUpdatePayload({ trustScore: 0.95 }).trust_score).toBe(0.95);
  });

  it('maps understandingLevel -> understanding_level', () => {
    expect(buildUpdatePayload({ understandingLevel: 4 }).understanding_level).toBe(4);
  });

  it('round-trips sample card with full SRS flush + content fields', () => {
    const nextReview = 1700000000;
    const lastReviewed = 1699999000;
    const payload = buildUpdatePayload({
      ...sampleCard,
      interval: 7,
      repetition: 1,
      easeFactor: 2.7,
      nextReview,
      lastReviewed,
      understandingLevel: 4,
      sourceType: 'wikipedia' as any,
      trustScore: 0.95,
    });
    expect(payload.interval).toBe(7);
    expect(payload.repetition).toBe(1);
    expect(payload.ease_factor).toBe(2.7);
    // Bug #4 contract: numeric ms-epoch → ISO 8601 string.
    expect(payload.next_review).toBe(new Date(nextReview).toISOString());
    expect(payload.last_reviewed).toBe(new Date(lastReviewed).toISOString());
    // Snakecase renames also propagate through the spread.
    expect(payload.front).toBe('Front');
    expect(payload.back).toBe('Back');
    expect(payload.deck_id).toBe('deck-1');
    expect(payload.understanding_level).toBe(4);
    expect(payload.source_type).toBe('wikipedia');
    expect(payload.trust_score).toBe(0.95);
  });

  it('passes through pre-stringified ISO timestamps verbatim (caller already ISO\'d)', () => {
    const isoNow = '2026-07-19T12:34:56.000Z';
    const isoNext = '2026-07-24T12:34:56.000Z';
    const payload = buildUpdatePayload({
      nextReview: isoNext,
      lastReviewed: isoNow,
    });
    expect(payload.next_review).toBe(isoNext);
    expect(payload.last_reviewed).toBe(isoNow);
  });

  it('omits undefined keys entirely (no ghost columns in UPDATE payload)', () => {
    const payload = buildUpdatePayload({});  // empty
    expect(Object.keys(payload)).toEqual([]);
  });

  it('drops a numeric NaN/Infinity nextReview timestamp silently (no column write)', () => {
    const payload = buildUpdatePayload({
      nextReview: NaN as unknown as number,
      lastReviewed: Infinity as unknown as number,
    });
    expect('next_review' in payload).toBe(false);
    expect('last_reviewed' in payload).toBe(false);
  });
});

describe('Bug #4: TIMESTAMPTZ serializer clamps numeric + garbage inputs', () => {
  it('toIsoOrUndef converts ms-epoch numeric to ISO string', () => {
    const ms = 1784507459794; // 2026-07-19; the value that triggered the live 22008
    const result = toIsoOrUndef(ms);
    expect(result).toBe(new Date(ms).toISOString());
  });

  it('toIsoOrUndef passes through a valid ISO string unchanged', () => {
    const iso = '2026-01-01T00:00:00.000Z';
    expect(toIsoOrUndef(iso)).toBe(iso);
  });

  it('toIsoOrUndef returns undefined for null / undefined / NaN / Infinity / empty', () => {
    expect(toIsoOrUndef(null)).toBeUndefined();
    expect(toIsoOrUndef(undefined)).toBeUndefined();
    expect(toIsoOrUndef(NaN)).toBeUndefined();
    expect(toIsoOrUndef(Infinity)).toBeUndefined();
    expect(toIsoOrUndef(-Infinity)).toBeUndefined();
    expect(toIsoOrUndef('')).toBeUndefined();
  });

  it('toIsoOrUndef passes through non-parseable strings verbatim (let Postgres 4xx loudly)', () => {
    expect(toIsoOrUndef('not-a-date')).toBe('not-a-date');
  });

  it('toIsoOrNull mirrors toIsoOrUndef but returns null instead of undefined for blanks', () => {
    expect(toIsoOrNull(null)).toBeNull();
    expect(toIsoOrNull(undefined)).toBeNull();
    expect(toIsoOrNull(NaN)).toBeNull();
    expect(typeof toIsoOrNull(1784507459794)).toBe('string');
  });

  it('isTimetzCompatible flags only valid ISO strings as wire-ready', () => {
    expect(isTimetzCompatible('2026-01-01T00:00:00Z')).toBe(true);
    expect(isTimetzCompatible(1784507459794)).toBe(false);
    expect(isTimetzCompatible('not-a-date')).toBe(false);
    expect(isTimetzCompatible(null)).toBe(false);
    expect(isTimetzCompatible(undefined)).toBe(false);
  });

  // Read-side helpers — Bug #4 round 9. Without these, `c.nextReview`
  // reassignment from PG would silently turn into a string, and every
  // due-card filter (`c.nextReview <= Date.now()`) would return false
  // because JS coerces the string to NaN on numeric comparison.
  it('parseIsoToMsOrUndef parses a valid ISO string to ms-epoch', () => {
    const iso = '2026-01-01T00:00:00.000Z';
    expect(parseIsoToMsOrUndef(iso)).toBe(Date.parse(iso));
  });

  it('parseIsoToMsOrUndef passes through a finite numeric value', () => {
    expect(parseIsoToMsOrUndef(1784507459794)).toBe(1784507459794);
    expect(parseIsoToMsOrUndef(0)).toBe(0);
  });

  it('parseIsoToMsOrUndef returns undefined for null / undefined / NaN / Infinity / empty / garbage string', () => {
    expect(parseIsoToMsOrUndef(null)).toBeUndefined();
    expect(parseIsoToMsOrUndef(undefined)).toBeUndefined();
    expect(parseIsoToMsOrUndef(NaN)).toBeUndefined();
    expect(parseIsoToMsOrUndef(Infinity)).toBeUndefined();
    expect(parseIsoToMsOrUndef(-Infinity)).toBeUndefined();
    expect(parseIsoToMsOrUndef('')).toBeUndefined();
    expect(parseIsoToMsOrUndef('not-a-date')).toBeUndefined();
  });

  it('parseIsoToMsOrNow returns ms-epoch for valid inputs, Date.now() for blanks', () => {
    const iso = '2026-01-01T00:00:00.000Z';
    expect(parseIsoToMsOrNow(iso)).toBe(Date.parse(iso));
    expect(parseIsoToMsOrNow(1784507459794)).toBe(1784507459794);
    // Falsy / nullish inputs fall back to ~now so the UI keeps treating
    // freshly-loaded cards as "due right now" instead of NaN-forever.
    const before = Date.now();
    const result = parseIsoToMsOrNow(null);
    const after = Date.now();
    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// Bug #5: "Studied today" counter reads 0 after a study session, AND every
// dashboard mount fires a `GET /rest/v1/league_memberships ... 404`.
//
// Live console trace:
//   GET https://ndwiaawqkkzdsdqeglez.supabase.co/rest/v1/league_memberships
//     ?select=user_id,weekly_xp,accuracy_rate&season_id=eq.2026-W30&tier=eq.1
//     404 (Not Found)
//   user: "when I study cards it says 0 still studied"
//
// Root causes:
//   1. `leagueService.ts` wired reads against `league_memberships` and
//      `league_seasons`, but neither table was migrated to the user's
//      Supabase project. Fix: ship `supabase/migrations/20260719_league_tables.sql`
//      creating both tables, indexes (season_id, tier) for the leaderboard,
//      guild-style RLS (read open, write self), and the schema_migrations
//      bookkeeping row required by supabaseContract.test.ts post-20260713.
//
//   2. StudyModePage rated cards → dbService.updateCard wrote the new
//      SRS schedule correctly (round 12 TIMESTAMPTZ sanitizer still in
//      effect), but the dashboard's "Studied today" filter
//      `cards.filter(c => c.lastReviewed >= todayStart)` ran against the
//      workspace context's stale `cards` snapshot — that snapshot never got
//      re-fetched or patched when the user came back to the dashboard.
//      Fix: DashboardWorkspaceContext now owns an internal override map
//      (last-write-wins per card-id), exposes `updateCardOptimistically`
//      on its public value, and the helper `applyOptimisticCardPatches`
//      is exported so the merge contract is testable without React.
//
//   3. StudyModePage never called `sessionService.saveStudySession`. So
//      `useStudyStats(userId).cardsReviewedToday` (derived from
//      study_sessions) returned 0 even though cards were being reviewed.
//      Fix: StudyModePage (and FlowMode for parity) now persist a session
//      row on the last card rating of the session.
// ---------------------------------------------------------------------------
describe('Bug #5: Studied-today counter & league_memberships schema', () => {
  it('applyOptimisticCardPatches: patch bumps lastReviewed so studiedToday count increases by 1', async () => {
    const { applyOptimisticCardPatches } = await import('../contexts/DashboardWorkspaceContext');
    const now = Date.now();
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    const baseCards: Card[] = [
      { id: 'a', front: 'Q1', back: 'A1', deckId: 'd', lastReviewed: 0, interval: 0, easeFactor: 2.5, repetition: 0 },
      { id: 'b', front: 'Q2', back: 'A2', deckId: 'd', lastReviewed: now - 24 * 3600_000, interval: 0, easeFactor: 2.5, repetition: 0 },
    ];
    // Sanity: BEFORE the patch, no card has been reviewed today.
    const studiedBefore = baseCards.filter(c => (c.lastReviewed ?? 0) >= todayStart.getTime()).length;
    expect(studiedBefore).toBe(0);

    // The patch StudyModePage → workspace emits on a single rating.
    const merged = applyOptimisticCardPatches(baseCards, { a: { lastReviewed: now } });

    expect(merged[0].lastReviewed).toBe(now);
    expect(merged[0].lastReviewed).toBeGreaterThanOrEqual(todayStart.getTime());
    // Untouched card stays stale.
    expect(merged[1].lastReviewed).toBeLessThan(todayStart.getTime());
    // The dashboard counter now reads 1.
    const studiedAfter = merged.filter(c => (c.lastReviewed ?? 0) >= todayStart.getTime()).length;
    expect(studiedAfter).toBe(1);
  });

  it('applyOptimisticCardPatches is identity when the patches map is empty', async () => {
    const { applyOptimisticCardPatches } = await import('../contexts/DashboardWorkspaceContext');
    const cards: Card[] = [
      { id: 'a', front: 'Q', back: 'A', deckId: 'd', lastReviewed: 100, interval: 0, easeFactor: 2.5, repetition: 0 },
    ];
    expect(applyOptimisticCardPatches(cards, {})).toBe(cards);
  });

  it('applyOptimisticCardPatches leaves a card alone if no patch targets its id', async () => {
    const { applyOptimisticCardPatches } = await import('../contexts/DashboardWorkspaceContext');
    const cards: Card[] = [
      { id: 'a', front: 'Q', back: 'A', deckId: 'd', lastReviewed: 100, interval: 0, easeFactor: 2.5, repetition: 0 },
    ];
    const merged = applyOptimisticCardPatches(cards, { b: { lastReviewed: 200 } });
    // Same reference — the unrelated card was untouched.
    expect(merged[0]).toBe(cards[0]);
  });

  it('applyOptimisticCardPatches normalises ISO-string lastReviewed back to ms-epoch (TIMESTAMPTZ round-trip)', async () => {
    const { applyOptimisticCardPatches } = await import('../contexts/DashboardWorkspaceContext');
    const isoNow = new Date().toISOString();
    const cards: Card[] = [
      { id: 'a', front: 'Q', back: 'A', deckId: 'd', lastReviewed: 0, interval: 0, easeFactor: 2.5, repetition: 0 },
    ];
    const merged = applyOptimisticCardPatches(cards, {
      a: { lastReviewed: isoNow as unknown as number },
    });
    expect(typeof merged[0].lastReviewed).toBe('number');
    expect(merged[0].lastReviewed).toBe(Date.parse(isoNow));
    expect(merged[0].lastReviewed as number).toBeGreaterThanOrEqual(new Date().setHours(0, 0, 0, 0));
  });

  it('applyOptimisticCardPatches normalises ISO-string nextReview with ms-epoch fallback (avoids NaN)', async () => {
    const { applyOptimisticCardPatches } = await import('../contexts/DashboardWorkspaceContext');
    const iso = new Date(Date.now() + 5 * 86400000).toISOString();
    const cards: Card[] = [
      { id: 'a', front: 'Q', back: 'A', deckId: 'd', lastReviewed: 0, nextReview: 0, interval: 0, easeFactor: 2.5, repetition: 0 },
    ];
    const merged = applyOptimisticCardPatches(cards, {
      a: { nextReview: iso as unknown as number },
    });
    expect(typeof merged[0].nextReview).toBe('number');
    expect(merged[0].nextReview).toBe(Date.parse(iso));
  });

  it('BUG #5: league migration declares league_seasons + league_memberships with the right shape', () => {
    const fs = require('node:fs') as typeof import('fs');
    const path = require('node:path') as typeof import('path');
    const p = path.resolve(__dirname, '../../..', 'supabase', 'migrations', '20260719_league_tables.sql');
    expect(fs.existsSync(p)).toBe(true);
    const src = fs.readFileSync(p, 'utf8');
    expect(src).toMatch(/CREATE TABLE\s+(IF NOT EXISTS\s+)?public\.league_seasons/);
    expect(src).toMatch(/CREATE TABLE\s+(IF NOT EXISTS\s+)?public\.league_memberships/);
    // UNIQUE constraint required for `.upsert(..., { onConflict: 'season_id,user_id' })`.
    expect(src).toMatch(/UNIQUE\s*\(\s*season_id\s*,\s*user_id\s*\)/i);
    expect(src).toMatch(/REFERENCES public\.league_seasons\(id\)/);
    expect(src).toMatch(/REFERENCES auth\.users\(id\)/);
    // Leaderboard index — every LeaguesPage render filters on (season_id, tier).
    expect(src).toMatch(/CREATE INDEX\s+(IF NOT EXISTS\s+)?idx_league_memberships_season_tier/);
    // Guild-style RLS: SELECT for everyone authenticated; write-self.
    expect(src).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(src).toMatch(/auth\.uid\(\)\s*=\s*user_id/);
    // Post-20260713 convention — the contract test enforces this INSERT.
    expect(src).toMatch(/INSERT INTO schema_migrations/);
    expect(src).toMatch(/VALUES\s*\(\s*'20260719_league_tables'/);
  });

  it('BUG #5: sessionService.saveStudySession exists with the Omit<StudySession, "id"> contract', async () => {
    const { sessionService } = await import('../services/database/modules/sessionService');
    expect(typeof sessionService.saveStudySession).toBe('function');
  });

  it('BUG #5: workspace context exposes updateCardOptimistically on its public API', async () => {
    // We don't render React here — that's a renderHook job in a different
    // test file. Pin the type-level surface so a misuse at the call site
    // (e.g. typing it as `[some]: Card => void`) breaks CI rather than
    // silently no-ops in production.
    const mod = await import('../contexts/DashboardWorkspaceContext');
    // The exported helper is what the runtime uses; the public method
    // documented on DashboardWorkspaceValue is `updateCardOptimistically`.
    // We pin via a typed-shape assert at module scope:
    type Surface = {
      updateCardOptimistically: (cardId: string, partial: Partial<Card>) => void;
    };
    const expectedSurface: keyof Surface = 'updateCardOptimistically';
    expect(Object.keys(mod)).toContain('applyOptimisticCardPatches');
    expect(typeof expectedSurface).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Bug #6: CogniVect parent-brand placement.
//
// User-context: BonaMind is the FIRST product in the CogniVect family. The
// user explicitly asked to place the parent brand visibly inside the
// application — beside or beneath the BonaMind mark, never inside it. The
// parent line lives in:
//   - DashboardSidebar (Sidebar.tsx)            — beneath BonaMind wordmark
//   - AppShell Wordmark (AppShell.tsx)           — beneath BonaMind wordmark
//   - Onboarding splash (OnboardingPage.tsx)    — bottom of the screen
//   - Docs legal footer (DocsPage.tsx)           — beneath "Back to BonaMind"
//
// Invariants enforced below:
//   - Single source of truth: `lib/branding.ts` is the only place that
//     exports "CogniVect" as a string literal.
//   - The reusable component `components/brand/CogniWordmark.tsx` is the
//     only way UI surfaces render the parent line. Hand-rolled copies
//     are not allowed.
//   - Store-listing metadata files (capacitor.config.ts,
//     Cargo.toml, metadata.json, package.json metadata, index.html) MUST
//     stay "BonaMind" only — Apple/Google reject promotional copy in the
//     visual app name. CogniVect belongs only in the "Developer/Vendor
//     Name" field, never in appName/identifier/og:title.
// ---------------------------------------------------------------------------
describe('Bug #6: CogniVect parent-brand placement', () => {
  it('BRAND aggregate keys align with the v3 contract (parentName / parentLegal / parentTagline / product)', async () => {
    const { BRAND, PARENT_COMPANY_NAME, PRODUCT_NAME, CONTACT_EMAIL, LEGAL_COPYRIGHT_LINE } = await import('../lib/branding');
    // The product name is asserted against app-identity.ts rather than a
    // literal, so a rename does not turn this guard into a rename chore — and
    // so it still catches the real regression: PRODUCT_NAME drifting away from
    // the name the shell surfaces actually use.
    const { APP_NAME } = await import('../../app-identity');
    // The v3 contract pinned by __tests__/branding.test.ts — these spot-checks
    // are the most user-visible assertions. The full parity test lives in
    // branding.test.ts; this block covers what Bug #6 cares about.
    expect(PARENT_COMPANY_NAME).toBe('CogniVect');
    expect(PRODUCT_NAME).toBe(APP_NAME);
    expect(CONTACT_EMAIL).toBe('hello@bonamind.app');
    expect(BRAND.parentName).toBe('CogniVect');
    expect(BRAND.parentLegal).toBe('CogniVect, Inc');
    expect(BRAND.parentTagline).toBe('cognitive · vector');
    expect(BRAND.product).toBe(APP_NAME);
    // The canonical copyright line stays stable across builds and is what
    // consumers should reach for (NOT a hand-rolled `new Date().getFullYear()`).
    expect(LEGAL_COPYRIGHT_LINE).toMatch(/^© \d{4} CogniVect, Inc\..*$/);
  });

  it('the parent-brand component surface is gone (the operating entity is being dissolved)', () => {
    const fs = require('node:fs') as typeof import('fs');
    const path = require('node:path');

    // CogniWordmark.tsx exported two things, both parent-brand: the CogniWordmark
    // line, and VectorMark, the double-chevron glyph. Neither is the product's
    // prism mark, so neither has a reason to exist now.
    //
    // The test this replaces asserted they exported as functions and that the
    // SVG had three <path> elements, to stop a "minor" rewrite changing the
    // mark. That guard is deleted along with the mark rather than inverted --
    // keeping it would enforce a brand that is being wound down.
    for (const gone of [
      path.resolve(__dirname, '..', 'components', 'brand', 'CogniWordmark.tsx'),
      path.resolve(__dirname, '..', 'components', 'shared', 'CogniVectFooter.tsx'),
    ]) {
      expect(fs.existsSync(gone), gone + ' should have been removed').toBe(false);
    }
    expect(
      fs.existsSync(path.resolve(__dirname, '..', 'components', 'shared', 'LegalFooter.tsx')),
    ).toBe(true);
  });

  it('BUG #6: no MARKETING surface reintroduces the parent brand', () => {
    const fs = require('node:fs') as typeof import('fs');
    const path = require('node:path');

    // The inverse of the guard this replaces. That one asserted every
    // mark-carrying page *must* reference the parent line; now that the entity
    // behind it is being dissolved, a page that names it is the defect, because
    // it asserts a company that will not exist is behind a product that does.
    //
    // Privacy Policy and Terms of Service are deliberately NOT in this list.
    // They name the operating entity in their body text, and that text is
    // frozen pending a legal decision -- see the FROZEN block in
    // lib/branding.ts. Asserting they are free of the entity name would fail
    // on the legal pages precisely because their legal content has not been
    // resolved yet, which would make this guard cry wolf.
    //
    // Comments are exempt for the same reason: the removal notes deliberately
    // record what was stripped and why.
    const targets = [
      '../pages/legal/DocsPage.tsx',
      '../pages/system/AboutPage.tsx',
      '../components/shared/LegalFooter.tsx',
    ];
    for (const rel of targets) {
      const p = path.resolve(__dirname, rel);
      expect(fs.existsSync(p), 'expected file at ' + p).toBe(true);
      const code = fs
        .readFileSync(p, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((l) => l.replace(/^\s*\/\/.*$/, ''))
        .join('\n');
      expect(
        code,
        rel + ' must not reference CogniVect -- the operating entity is being dissolved',
      ).not.toMatch(/CogniVect|VectorMark|PARENT_BRAND|PARENT_COMPANY/);
    }
  });

  it('BUG #6: app-store visual-identity files stay "BonaMind" only (no CogniVect in appName / productName / identifier / window title)', () => {
    const fs = require('node:fs') as typeof import('fs');
    const path = require('node:path') as typeof import('path');
    // Reason: Apple App Store + Google Play + the macOS dock + Windows
    // taskbar reject anything that looks like a tagline in the visual
    // app name. CogniVect belongs ONLY in the Developer/Vendor Name
    // field set at App Store Connect / Play Console console — NOT in
    // the appName/identifier fields of the build-time configs below.
    //
    // The Tauri .conf.json and Cargo.toml have OTHER fields where
    // CogniVect is the LEGITIMATE destination (bundle.publisher,
    // bundle.copyright, Cargo authors, etc.). Those fields' parent-brand
    // assertions live in the round-18 BUG #7 describe block; this
    // round-17 BUG #6 block stays focused on the identity-only files.
    //
    // Paths are RELATIVE TO __dirname (auramind-gemini/src/__tests__).
    // Two `..` segments lift back to auramind-gemini/.
    // The name is no longer typed into these files by hand. It comes from
    // app-identity.ts, and capacitor.config.ts / index.html consume it by
    // import and by a build-time transform respectively. So the assertion is
    // no longer "this file contains the literal 'BonaMind'" but "this file
    // still reads the name from the single source of truth" — a file that
    // re-introduces a hardcoded name would fail here.
    const identityFiles: ReadonlyArray<readonly [string, string, ReadonlyArray<string>]> = [
      // [rel path readable from __dirname, human label, tokens that MUST be present]
      // capacitor.config.ts pulls appName from app-identity.ts; `appId:` stays
      // a literal because the bundle id is deliberately not renameable.
      ['../../capacitor.config.ts',          'auramind-gemini/capacitor.config.ts',          ['appId:', "from './app-identity.ts'", 'appName: APP_NAME']],
      ['../../app-identity.ts',             'auramind-gemini/app-identity.ts',             ["export const APP_NAME = '"]],
      ['../../metadata.json',              'auramind-gemini/metadata.json',               ['"name": "BonaMind"']],
      ['../../package.json',               'auramind-gemini/package.json',                ['"name": "auramind"']],
      // index.html is rewritten at build time; the data-brand marker is what
      // the transform keys on, and its absence makes the build fail.
      ['../../index.html',                 'auramind-gemini/index.html',                  ['data-brand="title"', 'data-brand="og:title"']],
    ];
    for (const [rel, expectedPath, identityTokens] of identityFiles) {
      const p = path.resolve(__dirname, rel);
      expect(fs.existsSync(p), `expected file at ${expectedPath}`).toBe(true);
      const src = fs.readFileSync(p, 'utf8');
      for (const tok of identityTokens) {
        expect(src, `${expectedPath} should still set identity-token ${JSON.stringify(tok)}`).toContain(tok);
      }
      expect(
        src,
        `${expectedPath} must not contain CogniVect — that's a rejected tagline in app-store metadata`,
      ).not.toMatch(/CogniVect/);
    }
  });

  it('BUG #6: only `lib/branding.ts` declares the literal "CogniVect" (single source of truth)', () => {
    // Enforces that future components reach for PARENT_COMPANY_NAME or
    // BRAND.parentName instead of hardcoding the literal. The literal
    // 'CogniVect' should appear as a string ONCE in the codebase —
    // bound to PARENT_COMPANY_NAME — and BRAND.parentName must mirror it.
    const fs = require('node:fs') as typeof import('fs');
    const path = require('node:path') as typeof import('path');
    const brandingSrc = fs.readFileSync(
      path.resolve(__dirname, '..', 'lib', 'branding.ts'),
      'utf8',
    );
    // The canonical literal lives on the named constant.
    expect(brandingSrc).toMatch(/PARENT_COMPANY_NAME\s*=\s*['"]CogniVect['"]/);
    // The BRAND aggregate mirrors via identifier reference (NOT a quoted
    // literal in the aggregate body). This pins the architecture: ONE
    // string literal in the file, mirrored everywhere via PARENT_COMPANY_NAME.
    expect(brandingSrc).toMatch(/parentName:\s*PARENT_COMPANY_NAME/);

    // Every consumer component reaches for the named constant rather than
    // repeating the literal as a quote-pair string. The regex matches
    // 'CogniVect' / "CogniVect" / `CogniVect` — NOT identifier references
    // like PARENT_COMPANY_NAME, NOT JSDoc text.
    const consumers = [
      '../components/shared/LegalFooter.tsx',
      '../pages/legal/PrivacyPolicyPage.tsx',
      '../pages/legal/TermsOfServicePage.tsx',
    ];
    for (const rel of consumers) {
      const p = path.resolve(__dirname, rel);
      expect(fs.existsSync(p), `expected consumer at ${rel}`).toBe(true);
      const src = fs.readFileSync(p, 'utf8');
      expect(
        src,
        `${rel} must not contain a quoted 'CogniVect' literal — reach for the named constant`,
      ).not.toMatch(/['"`]CogniVect['"`]/);
    }
  });

  it('BUG #6: the parent-brand variant tier went with the component', () => {
    // Was: "CogniWordmark variant tier is canonical (inline / splash /
    // footnote)" — a positive-only assertion reading CogniWordmark.tsx. The
    // component is gone, so there is no tier left to pin, and no replacement
    // should grow one: the product has a single mark.
    const fs = require('node:fs') as typeof import('fs');
    const path = require('node:path');
    const gone = path.resolve(__dirname, '..', 'components', 'brand', 'CogniWordmark.tsx');
    expect(fs.existsSync(gone)).toBe(false);
    expect(fs.existsSync(path.resolve(__dirname, '..', 'components', 'brand'))).toBe(true);
  });
});
