/**
 * When to nudge, and what to say. Pure; the Rust shell holds the timer.
 * Rules (spec §4): the daily reminder at the user's time if anything is due;
 * at most one extra afternoon nudge when 10+ cards are fading; never in
 * quiet hours; never two within 2 hours; only the next 24 hours.
 */
import type { DueState, PlannedNudge } from './bridge';
import { DEFAULT_QUIET_END_HOUR, DEFAULT_QUIET_START_HOUR } from '../services/memory/sparkScheduler';

export interface NudgePrefs {
  reminderTime: string; // "HH:MM"
  dailyReminder: boolean;
  dueReminder: boolean;
  quietStartHour: number;
  quietEndHour: number;
}

export const DEFAULT_NUDGE_PREFS: NudgePrefs = {
  reminderTime: '09:00',
  dailyReminder: true,
  dueReminder: true,
  quietStartHour: DEFAULT_QUIET_START_HOUR,
  quietEndHour: DEFAULT_QUIET_END_HOUR,
};

const HOUR = 3_600_000;
const AFTERNOON_HOUR = 15;
const SECONDS_PER_CARD = 25;
const MIN_GAP = 2 * HOUR;

const isQuiet = (t: number, p: NudgePrefs) => {
  const h = new Date(t).getHours();
  return h >= p.quietStartHour || h < p.quietEndHour;
};

/** Next local time at hh:mm at or after `now`, pushed out of quiet hours. */
function nextAt(now: number, hh: number, mm: number, p: NudgePrefs): number {
  const d = new Date(now);
  d.setHours(hh, mm, 0, 0);
  if (d.getTime() < now) d.setDate(d.getDate() + 1);
  if (isQuiet(d.getTime(), p)) {
    if (d.getHours() >= p.quietStartHour) d.setDate(d.getDate() + 1);
    d.setHours(p.quietEndHour, 0, 0, 0);
  }
  return d.getTime();
}

export function nudgeText(state: DueState): { title: string; body: string } {
  const title = state.due === 1 ? '1 card is ready' : `${state.due} cards are ready`;
  const minutes = Math.max(1, Math.round((state.due * SECONDS_PER_CARD) / 60));
  const time = minutes === 1 ? 'About 1 minute.' : `About ${minutes} minutes.`;
  const decks = state.topDecks.join(' and ');
  let tail = '';
  if (decks && state.fadingCount > 0) tail = ` ${decks} ${state.topDecks.length > 1 ? 'are' : 'is'} fading.`;
  else if (decks) tail = ` From ${decks}.`;
  return { title, body: `${time}${tail}` };
}

export function planNudges(state: DueState, prefs: NudgePrefs, now: number): PlannedNudge[] {
  if (state.due <= 0) return [];
  const [hh, mm] = prefs.reminderTime.split(':').map((n) => Number.parseInt(n, 10));
  const text = nudgeText(state);
  const times: number[] = [];
  if (prefs.dailyReminder && Number.isFinite(hh) && Number.isFinite(mm)) {
    times.push(nextAt(now, hh, mm, prefs));
  }
  if (prefs.dueReminder && state.fadingCount >= 10) {
    const afternoon = nextAt(now, AFTERNOON_HOUR, 0, prefs);
    if (times.every((t) => Math.abs(t - afternoon) >= MIN_GAP)) times.push(afternoon);
  }
  return times
    .filter((t) => t - now <= 24 * HOUR)
    .sort((a, b) => a - b)
    .map((atMs) => ({ atMs, ...text }));
}
