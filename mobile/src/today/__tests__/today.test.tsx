import type { Card, Deck, StudySession } from '@bonamind/core';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useCards, useDecks, useSessions } from '../../data/hooks';
import { TodayScreen } from '../TodayScreen';
import { searchLibrary, summarizeToday } from '../summary';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, Stack: { Screen: () => null } }));
jest.mock('../../data/hooks', () => ({ useDecks: jest.fn(), useCards: jest.fn(), useSessions: jest.fn() }));
jest.mock('../../data/auth', () => ({ useAuth: () => ({ userId: 'u1', status: 'signed-in' }) }));
jest.mock('../../design/motion', () => ({ useMotion: () => ({ reduce: true, spring: () => ({ duration: 180 }) }) }));
jest.mock('expo-glass-effect', () => ({ GlassView: 'GlassView', isLiquidGlassAvailable: () => false }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

const NOW = new Date(2026, 9, 8, 18, 0, 0);
const deck = (id: string, title: string): Deck => ({ id, title, description: '', createdAt: 0, cardCount: 0 });
const card = (id: string, deckId: string, front: string, dueIn: number): Card => ({ id, deckId, front, back: '', nextReview: NOW.getTime() + dueIn });
const sessions: StudySession[] = [];

function given(decks: Deck[], cards: Card[]) {
  (useDecks as jest.Mock).mockReturnValue({ data: decks });
  (useCards as jest.Mock).mockReturnValue({ data: cards });
  (useSessions as jest.Mock).mockReturnValue({ data: sessions });
}

beforeEach(() => { jest.useFakeTimers({ now: NOW }); jest.clearAllMocks(); });
afterEach(() => jest.useRealTimers());

it('shows the due count and the time it takes', async () => {
  const cards = [...Array(12)].map((_, i) => card(`c${i}`, i < 9 ? 'bio' : 'es', `q${i}`, -1000));
  given([deck('bio', 'Cell biology'), deck('es', 'Spanish')], cards);
  await render(<TodayScreen />);
  expect(screen.getByText('12 cards')).toBeTruthy();
  expect(screen.getByText('About 6 minutes')).toBeTruthy();
});

it('starts the review on the deck with the most due cards', async () => {
  given([deck('bio', 'Cell biology'), deck('es', 'Spanish')], [card('a', 'es', 'a', -1), card('b', 'bio', 'b', -1), card('c', 'bio', 'c', -1)]);
  await render(<TodayScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'Start review' }));
  expect(router.push).toHaveBeenCalledWith('/study/bio');
});

it('is all caught up with no decks', async () => {
  given([], []);
  await render(<TodayScreen />);
  expect(screen.getByText('All caught up')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Start review' })).toBeNull();
});

it('is all caught up when nothing is due', async () => {
  given([deck('bio', 'Cell biology')], [card('a', 'bio', 'a', 86_400_000)]);
  await render(<TodayScreen />);
  expect(screen.getByText('All caught up')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Start review' })).toBeNull();
});

it('summarizes per-course progress', () => {
  const s = summarizeToday([deck('bio', 'Cell biology')], [{ ...card('a', 'bio', 'a', -1), repetition: 2 }, card('b', 'bio', 'b', 5_000)], [], NOW);
  expect(s.courses[0]).toMatchObject({ due: 1, reviewed: 1, total: 2 });
});

it('searches card fronts and the decks that hold them', () => {
  const r = searchLibrary([deck('bio', 'Cell biology'), deck('es', 'Spanish')], [card('m', 'bio', 'Mitosis phases', 0)], 'mito');
  expect(r.cards.map((c) => c.front)).toEqual(['Mitosis phases']);
  expect(r.decks.map((d) => d.title)).toEqual(['Cell biology']);
});
