import { describe, it, expect } from 'vitest';
import { DEFAULT_NUDGE_PREFS, nudgeText, planNudges } from '../desktop/nudgePlanner';
import type { DueState } from '../desktop/bridge';

const at = (h: number, m = 0, day = 29) => new Date(2026, 8, day, h, m).getTime();
const state = (over: Partial<DueState> = {}): DueState => ({ due: 12, fadingCount: 0, topDecks: ['Spanish A1', 'Enzymes'], streak: 3, studying: false, ...over });

describe('planNudges', () => {
  it('nothing due, nothing planned', () => {
    expect(planNudges(state({ due: 0 }), DEFAULT_NUDGE_PREFS, at(7))).toEqual([]);
  });

  it('plans the daily reminder later today', () => {
    const [n] = planNudges(state(), DEFAULT_NUDGE_PREFS, at(7));
    expect(n.atMs).toBe(at(9));
  });

  it('rolls to tomorrow once today’s time has passed', () => {
    const [n] = planNudges(state(), DEFAULT_NUDGE_PREFS, at(10));
    expect(n.atMs).toBe(at(9, 0, 30));
  });

  it('never lands in quiet hours: a 23:30 reminder moves to 08:00', () => {
    const [n] = planNudges(state(), { ...DEFAULT_NUDGE_PREFS, reminderTime: '23:30' }, at(12));
    expect(n.atMs).toBe(at(8, 0, 30));
  });

  it('respects the daily-reminder switch', () => {
    expect(planNudges(state(), { ...DEFAULT_NUDGE_PREFS, dailyReminder: false }, at(7))).toEqual([]);
  });

  it('adds one afternoon nudge only when 10+ cards are fading', () => {
    expect(planNudges(state({ fadingCount: 9 }), DEFAULT_NUDGE_PREFS, at(7))).toHaveLength(1);
    const plan = planNudges(state({ fadingCount: 10 }), DEFAULT_NUDGE_PREFS, at(7));
    expect(plan.map((n) => n.atMs)).toEqual([at(9), at(15)]);
  });

  it('never two nudges within 2 hours', () => {
    const plan = planNudges(state({ fadingCount: 20 }), { ...DEFAULT_NUDGE_PREFS, reminderTime: '14:00' }, at(7));
    expect(plan.map((n) => n.atMs)).toEqual([at(14)]);
  });

  it('plans only the next 24 hours', () => {
    for (const n of planNudges(state({ fadingCount: 20 }), DEFAULT_NUDGE_PREFS, at(16))) {
      expect(n.atMs - at(16)).toBeLessThanOrEqual(24 * 3600_000);
    }
  });
});

describe('nudgeText', () => {
  it('matches the approved notification', () => {
    expect(nudgeText(state({ fadingCount: 4 }))).toEqual({
      title: '12 cards are ready',
      body: 'About 5 minutes. Spanish A1 and Enzymes are fading.',
    });
  });

  it('reads naturally for one card and no fading decks', () => {
    expect(nudgeText(state({ due: 1, topDecks: ['Enzymes'] }))).toEqual({
      title: '1 card is ready',
      body: 'About 1 minute. From Enzymes.',
    });
  });
});
