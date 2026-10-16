/**
 * The Windows app's Today screen: what's due, a time estimate, Start review,
 * streak and "remembered this week", the courses with cards due (first 5),
 * and the caught-up / no-courses / stats-failed states.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import type { StudySession } from '../types';

const fetchStudySessions = vi.hoisted(() => vi.fn());
vi.mock('../services/database/modules/sessionService', () => ({
  sessionService: { fetchStudySessions: (...a: unknown[]) => fetchStudySessions(...a) },
}));

import { coursesWithDue, dueCount, nextDueAt, reviewMinutes, weekAnswered } from '../components/windows/todayModel';
import { WindowsToday } from '../components/windows/WindowsToday';
import { NOW, cardsFor, deck, renderWithWorkspace } from './helpers/windowsWorkspace';

const DAY = 86_400_000;
const bio = deck('d-bio', 'Biology 101');
const spa = deck('d-spa', 'Spanish A2');
const his = deck('d-his', 'World History');
const decks = [his, bio, spa];
const cards = [...cardsFor('d-bio', 12), ...cardsFor('d-spa', 8), ...cardsFor('d-his', 4, 2)];

const session = (answered: number, correct: number, daysAgo = 1): StudySession =>
  ({ id: `s${answered}-${daysAgo}`, userId: 'u-1', startTime: NOW - daysAgo * DAY, totalAnswers: answered, correctAnswers: correct } as StudySession);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  fetchStudySessions.mockReset().mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

const where = () => screen.getByTestId('where').textContent;

describe('todayModel', () => {
  it('counts due cards', () => {
    expect(dueCount(cards, NOW)).toBe(24);
  });

  it('estimates about 20 seconds a card, at least a minute', () => {
    expect(reviewMinutes(24)).toBe(8);
    expect(reviewMinutes(1)).toBe(1);
    expect(reviewMinutes(0)).toBe(0);
  });

  it('lists courses with cards due, most due first', () => {
    expect(coursesWithDue(decks, cards, NOW).map((c) => [c.deck.title, c.due])).toEqual([
      ['Biology 101', 12],
      ['Spanish A2', 8],
      ['World History', 4],
    ]);
  });

  it('finds the next review after now', () => {
    expect(nextDueAt(cards, NOW)).toBe(NOW + 2 * DAY);
    expect(nextDueAt(cardsFor('x', 3), NOW)).toBeUndefined();
  });

  it('counts the last 7 days of answers only', () => {
    expect(weekAnswered([session(6, 5, 1), session(4, 4, 3), session(50, 40, 9)], NOW)).toBe(10);
  });
});

describe('WindowsToday', () => {
  it('shows the due count and starts a review', () => {
    renderWithWorkspace(<WindowsToday />, { fixture: { decks, cards } });
    expect(screen.queryByText(/Good (morning|afternoon|evening)/)).toBeNull();
    expect(screen.getByTestId('due-count')).toHaveTextContent('24');
    expect(screen.getByText('About 8 minutes')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Start review' }));
    expect(where()).toMatch(/^\/dashboard\/study\//);
  });

  it('studies one course from its row', () => {
    renderWithWorkspace(<WindowsToday />, { fixture: { decks, cards } });
    fireEvent.click(screen.getByRole('button', { name: /Spanish A2/ }));
    expect(where()).toBe('/dashboard/study/d-spa');
  });

  it('shows the first 5 courses and a link to the rest', () => {
    const many = Array.from({ length: 7 }, (_, i) => deck(`d${i}`, `Course ${i}`));
    const manyCards = many.flatMap((d, i) => cardsFor(d.id, i + 1));
    renderWithWorkspace(<WindowsToday />, { fixture: { decks: many, cards: manyCards } });
    expect(screen.getAllByRole('button', { name: /^Course \d/ })).toHaveLength(5);
    expect(screen.getByRole('link', { name: 'See all in Library' })).toHaveAttribute('href', '/dashboard/decks');
  });

  it('shows "remembered this week" only after 10 reviews', async () => {
    fetchStudySessions.mockResolvedValue([session(9, 8)]);
    const first = renderWithWorkspace(<WindowsToday />, { fixture: { decks, cards } });
    await waitFor(() => expect(fetchStudySessions).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('stats-loading')).toBeNull());
    expect(screen.queryByText(/remembered this week/)).toBeNull();
    first.unmount();

    fetchStudySessions.mockResolvedValue([session(10, 9)]);
    renderWithWorkspace(<WindowsToday />, { fixture: { decks, cards } });
    expect(await screen.findByText(/90% remembered this week/)).toBeVisible();
  });

  it('shows the streak worked out from real study days', async () => {
    fetchStudySessions.mockResolvedValue([session(3, 3, 0), session(3, 3, 1)]);
    renderWithWorkspace(<WindowsToday />, { fixture: { decks, cards } });
    expect(await screen.findByText(/2-day streak/)).toBeVisible();
  });

  it('says "1-day streak" for a one-day streak', async () => {
    fetchStudySessions.mockResolvedValue([session(3, 3, 0)]);
    renderWithWorkspace(<WindowsToday />, { fixture: { decks, cards } });
    expect(await screen.findByText(/1-day streak/)).toBeVisible();
  });

  it('says you are caught up when nothing is due', () => {
    renderWithWorkspace(<WindowsToday />, { fixture: { decks: [his], cards: cardsFor('d-his', 0, 2) } });
    expect(screen.getByText('All caught up')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'New course' }));
    expect(where()).toBe('/dashboard/generator');
  });

  it('welcomes a user with no courses', () => {
    renderWithWorkspace(<WindowsToday />);
    fireEvent.click(screen.getByRole('button', { name: 'Create your first course' }));
    expect(where()).toBe('/dashboard/generator');
  });

  it('lists the due courses with their card counts and when they were last studied', () => {
    renderWithWorkspace(<WindowsToday />, { fixture: { decks, cards } });
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Course', 'Due', 'Cards', 'Last studied']);
    const hist = screen.getByRole('button', { name: /World History/ }).closest('tr')!;
    expect(hist).toHaveTextContent('4');
    expect(hist).toHaveTextContent('6');
  });

  it('offers Try again when the stats fail to load', async () => {
    fetchStudySessions.mockReset().mockRejectedValue(new Error('offline'));
    renderWithWorkspace(<WindowsToday />, { fixture: { decks, cards } });
    const retry = await screen.findByRole('button', { name: 'Try again' });
    const before = fetchStudySessions.mock.calls.length;
    fireEvent.click(retry);
    expect(fetchStudySessions.mock.calls.length).toBe(before + 1);
    expect(screen.getByRole('button', { name: 'Start review' })).toBeVisible();
  });
});
