import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Card } from '../types';

const userId = vi.hoisted(() => ({ value: 'u1' as string | null | undefined }));
vi.mock('../hooks/useCurrentUserId', () => ({ useCurrentUserId: () => userId.value }));
const fetchCards = vi.hoisted(() => vi.fn());
vi.mock('../services/database/dbService', () => ({
  dbService: { fetchCards: (...a: unknown[]) => fetchCards(...a), fetchDecks: async () => [{ id: 'd', title: 'Spanish A1' }] },
}));
const rateCard = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({})));
vi.mock('../services/study/rateCard', () => ({ rateCard: (...a: unknown[]) => rateCard(...a) }));
const bridge = vi.hoisted(() => ({ cardsChanged: vi.fn(), quickReviewDone: vi.fn(), showMain: vi.fn() }));
vi.mock('../desktop/bridge', () => ({ desktop: bridge }));

import QuickReviewPage, { formatNextDue, pickDueCards } from '../pages/quickReview/QuickReviewPage';

const NOW = Date.now();
const card = (id: string, nextReview: number): Card =>
  ({ id, deckId: 'd', front: `front ${id}`, back: `back ${id}`, nextReview }) as Card;

beforeEach(() => {
  userId.value = 'u1';
  fetchCards.mockReset();
  rateCard.mockClear();
  Object.values(bridge).forEach((f) => f.mockClear());
});
afterEach(() => vi.useRealTimers());

describe('pickDueCards', () => {
  it('most overdue first, at most 10, future cards excluded', () => {
    const cards = Array.from({ length: 14 }, (_, i) => card(`c${i}`, NOW - i * 1000)).concat(card('future', NOW + 1000));
    const picked = pickDueCards(cards, NOW);
    expect(picked).toHaveLength(10);
    expect(picked[0].id).toBe('c13');
    expect(picked.some((c) => c.id === 'future')).toBe(false);
  });
});

describe('formatNextDue', () => {
  it('reads naturally', () => {
    expect(formatNextDue(null, NOW)).toBe('');
    expect(formatNextDue(NOW + 25 * 60_000, NOW)).toBe('Next card due in 25 min');
    expect(formatNextDue(NOW + 3 * 3_600_000, NOW)).toBe('Next card due in 3h');
    expect(formatNextDue(NOW + 30 * 3_600_000, NOW)).toBe('Next card due tomorrow');
  });
});

describe('QuickReviewPage', () => {
  it('flips with Space, rates with 1–4, and tells the main window', async () => {
    fetchCards.mockResolvedValue([card('a', NOW - 10), card('b', NOW - 5)]);
    render(<QuickReviewPage />);
    expect(await screen.findByText('front a')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(screen.getByText('back a')).toBeInTheDocument();
    await act(async () => { fireEvent.keyDown(window, { key: '3', code: 'Digit3' }); });
    expect(rateCard).toHaveBeenCalledWith(expect.objectContaining({ card: expect.objectContaining({ id: 'a' }), surface: 'quick-review' }));
    expect(bridge.cardsChanged).toHaveBeenCalled();
    expect(screen.getByText('front b')).toBeInTheDocument();
  });

  it('rating keys do nothing until the answer is shown', async () => {
    fetchCards.mockResolvedValue([card('a', NOW - 10)]);
    render(<QuickReviewPage />);
    await screen.findByText('front a');
    await act(async () => { fireEvent.keyDown(window, { key: '3', code: 'Digit3' }); });
    expect(rateCard).not.toHaveBeenCalled();
  });

  it('finishing shows the done state and hides itself after 2 seconds', async () => {
    fetchCards.mockResolvedValue([card('a', NOW - 10), card('later', NOW + 3 * 3_600_000)]);
    render(<QuickReviewPage />);
    await screen.findByText('front a');
    vi.useFakeTimers();
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    await act(async () => { fireEvent.keyDown(window, { key: '4', code: 'Digit4' }); });
    expect(screen.getByText('All caught up')).toBeInTheDocument();
    expect(screen.getByText('Next card due in 3h')).toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(bridge.quickReviewDone).toHaveBeenCalled();
  });

  it('Esc hides the panel', async () => {
    fetchCards.mockResolvedValue([card('a', NOW - 10)]);
    render(<QuickReviewPage />);
    await screen.findByText('front a');
    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(bridge.quickReviewDone).toHaveBeenCalled();
  });

  it('signed out: offers sign-in in the main window', async () => {
    userId.value = null;
    render(<QuickReviewPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in to AuraMind' }));
    expect(bridge.showMain).toHaveBeenCalledWith('/auth');
    expect(bridge.quickReviewDone).toHaveBeenCalled();
  });
});
