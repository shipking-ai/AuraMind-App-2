import { expect, it } from 'vitest';
import { computeStreak, deriveRetention7d, dueCards, type Card, type StudySession } from '../src';

const day = (d: number) => new Date(2026, 9, d, 12, 0, 0).getTime(); // local noon, October 2026
const sessions = (...days: number[]): StudySession[] => days.map((d, i) => ({ id: `s${i}`, userId: 'u', startTime: day(d) }));
const NOW = new Date(2026, 9, 8, 18, 0, 0);

it('counts consecutive study days ending today', () => {
  expect(computeStreak(sessions(6, 7, 8), NOW)).toBe(3);
});

it('keeps the streak anchored at yesterday until a full day is missed', () => {
  expect(computeStreak(sessions(6, 7), NOW)).toBe(2);
  expect(computeStreak(sessions(5, 6), NOW)).toBe(0);
  expect(computeStreak([], NOW)).toBe(0);
});

it('averages accuracy over the last 7 days', () => {
  const s: StudySession[] = [
    { id: 'a', userId: 'u', startTime: day(7), totalAnswers: 10, correctAnswers: 8 },
    { id: 'b', userId: 'u', startTime: day(1) - 7 * 86_400_000, totalAnswers: 10, correctAnswers: 0 },
  ];
  expect(deriveRetention7d(s, NOW.getTime())).toBe(0.8);
});

it('returns due cards, soonest first, excluding future ones', () => {
  const t = NOW.getTime();
  const cards: Card[] = [
    { id: 'later', deckId: 'd', front: '', back: '', nextReview: t + 60_000 },
    { id: 'b', deckId: 'd', front: '', back: '', nextReview: t - 1_000 },
    { id: 'a', deckId: 'd', front: '', back: '', nextReview: t - 5_000 },
  ];
  expect(dueCards(cards, t).map((c) => c.id)).toEqual(['a', 'b']);
});
