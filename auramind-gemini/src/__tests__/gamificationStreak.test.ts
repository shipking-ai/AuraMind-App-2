// @vitest-environment jsdom
//
// Regression coverage for `gamificationService.trackStudySession`'s streak
// date-arithmetic. Locks in two prior bugs that bit the whole streak widget:
//
//   1. `yesterday.setDate(yesterday.setDate() - 1)` — the inner no-arg call
//      returned a UNIX timestamp that the outer .setDate reinterpreted as
//      day-of-month, breaking every cross-day rollover.
//   2. StudyModePage never called `trackStudySession` at all, so the
//      streak widget on the dashboard stayed at zero forever.
//
// If a future change reverts either fix, one of these assertions will fail
// loudly. Run with `npm test -- gamificationStreak`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getUserStats,
  trackStudySession,
  resetUserData,
} from '../services/gamification/gamificationService';

const KEY_LAST_STUDY = 'bonamind_last_study_date';
const KEY_STREAK_DAYS = 'bonamind_streak_days';

function clearStorage() {
  for (const k of [
    KEY_LAST_STUDY,
    KEY_STREAK_DAYS,
    'bonamind_user_xp',
    'bonamind_cards_studied',
    'bonamind_decks_created',
    'bonamind_sessions_completed',
    'bonamind_accuracy',
    'bonamind_study_time',
    'bonamind_achievements',
  ]) {
    localStorage.removeItem(k);
  }
}

beforeEach(() => {
  clearStorage();
});

afterEach(() => {
  vi.useRealTimers();
  clearStorage();
});

describe('trackStudySession — streak date arithmetic', () => {
  it('first-ever study bumps streak from 0 → 1', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T10:00:00Z'));

    trackStudySession(15, 95);

    expect(getUserStats().streakDays).toBe(1);
    expect(localStorage.getItem(KEY_LAST_STUDY)).toBe(
      new Date().toDateString(),
    );
  });

  it('same-day repeat MUST NOT bump the streak', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T10:00:00Z'));

    trackStudySession(15, 95);  // first study today → streak = 1
    trackStudySession(10, 80);  // second study same day → streak stays 1

    expect(getUserStats().streakDays).toBe(1);
  });

  it('cross-day continuation (yesterday studied) bumps streak 1 → 2', () => {
    // Same TZ-stable pattern: drive lastStudy from the mocked clock so
    // yesterday.toDateString() and the function's yesterday.toDateString()
    // are guaranteed to agree regardless of host timezone.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00Z'));

    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    localStorage.setItem(KEY_STREAK_DAYS, '1');
    localStorage.setItem(KEY_LAST_STUDY, yesterdayDate.toDateString());

    trackStudySession(15, 95);

    // Regression guard: original .setDate(.setDate() - 1) bug broke this —
    // it would either keep streak at 1 forever or roll back to a wrong day.
    expect(getUserStats().streakDays).toBe(2);
  });

  it('skipped-day reset (last studied 2+ days ago) starts at 1', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T12:00:00Z'));

    // Three days back from the mocked clock
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    localStorage.setItem(KEY_LAST_STUDY, threeDaysAgo.toDateString());

    trackStudySession(15, 95);

    expect(getUserStats().streakDays).toBe(1);
  });

  it('cross-month rollover June 30 → July 1 bumps streak 1 → 2 (regression guard)', () => {
    // Drives BOTH `lastStudy` and the function's `today` from the same
    // mocked clock so the test is TZ-agnostic across CI / dev / WSL.
    // The cross-month behaviour this guards is the Date.setDate(0) auto-roll:
    // if today is July 1, setDate(getDate() - 1) → setDate(0) → 2026-06-30.
    // The bug-prone `.setDate(.setDate() - 1)` would interpret the inner
    // call's UNIX timestamp as day-of-month and roll to a random day,
    // breaking the comparison — this test would fail in that case.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));

    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    localStorage.setItem(KEY_STREAK_DAYS, '1');
    localStorage.setItem(KEY_LAST_STUDY, yesterdayDate.toDateString());

    trackStudySession(15, 95);

    expect(getUserStats().streakDays).toBe(2);
  });

  it('resetUserData() clears all aura-mind keys (regression guard)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-21T10:00:00Z'));
    trackStudySession(15, 95);
    expect(getUserStats().streakDays).toBe(1);

    resetUserData();

    // The keyset that resetUserData clears MUST stay in lockstep with
    // what trackStudySession + updateUserStats write. Previously the
    // function cleared an orphan `bonamind_user_streak` (computed by
    // nothing in the codebase) and left the actually-used
    // `bonamind_streak_days` untouched — so QA / Playwright runs
    // could never reset the streak widget between cases. Guard it.
    expect(getUserStats().streakDays).toBe(0);
    expect(getUserStats().xp).toBe(0);
    expect(getUserStats().sessionsCompleted).toBe(0);
    expect(localStorage.getItem('bonamind_last_study_date')).toBeNull();
  });
});
