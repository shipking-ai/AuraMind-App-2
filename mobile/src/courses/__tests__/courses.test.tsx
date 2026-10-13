import type { Card, Deck } from '@bonamind/core';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useCards, useDecks } from '../../data/hooks';
import { CourseDetailScreen, MASTERED_INTERVAL_DAYS } from '../CourseDetailScreen';
import { CoursesScreen } from '../CoursesScreen';
import { useCreateStore } from '../../create/store';

// Stack.Screen renders its headerRight so header buttons can be pressed in tests.
jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useLocalSearchParams: jest.fn(), Stack: { Screen: ({ options }: { options?: { headerRight?: () => unknown } }) => options?.headerRight?.() ?? null } }));
jest.mock('expo-glass-effect', () => ({ GlassView: 'GlassView', isLiquidGlassAvailable: () => false }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('../../data/supabase', () => ({ getSupabase: () => ({}) }));
jest.mock('../../data/app', () => ({ getData: () => ({}) }));
jest.mock('../../data/hooks', () => ({ useDecks: jest.fn(), useCards: jest.fn() }));
jest.mock('../../data/auth', () => ({ useAuth: () => ({ userId: 'u1', status: 'signed-in' }) }));
jest.mock('../../env', () => ({ env: { apiBaseUrl: 'https://bonamind.app' } }));
jest.mock('../../design/motion', () => ({ useMotion: () => ({ reduce: true, spring: () => ({ duration: 180 }) }) }));

const NOW = Date.UTC(2026, 9, 8, 18);
const deck = (id: string, title: string, cardCount: number): Deck => ({ id, title, description: `About ${title}`, createdAt: 0, cardCount });
const card = (id: string, deckId: string, dueIn: number, interval = 0): Card => ({ id, deckId, front: id, back: id, nextReview: NOW + dueIn, interval });

beforeEach(() => { jest.useFakeTimers({ now: NOW }); jest.clearAllMocks(); });
afterEach(() => jest.useRealTimers());

it('lists courses with their due counts and opens one', async () => {
  (useDecks as jest.Mock).mockReturnValue({ data: [deck('bio', 'Cell biology', 3), deck('es', 'Spanish', 1)] });
  (useCards as jest.Mock).mockReturnValue({ data: [card('a', 'bio', -1), card('b', 'bio', -1), card('c', 'bio', 9e9), card('d', 'es', 9e9)] });
  await render(<CoursesScreen />);
  expect(screen.getByText('Cell biology')).toBeTruthy();
  expect(screen.getByText('2 due · 3 cards')).toBeTruthy();
  expect(screen.getByText('Up to date · 1 card')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Cell biology' }));
  expect(router.push).toHaveBeenCalledWith('/courses/bio');
});

it('invites a new account to make its first course here', async () => {
  (useDecks as jest.Mock).mockReturnValue({ data: [] });
  (useCards as jest.Mock).mockReturnValue({ data: [] });
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  await render(<CoursesScreen />);
  expect(screen.getByText('Make your first course')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Make a course' }));
  expect(router.push).toHaveBeenCalledWith('/create');
  await fireEvent.press(screen.getByRole('button', { name: 'Open BonaMind on the web' }));
  expect(open).toHaveBeenCalledWith('https://bonamind.app');
});

it('has a New course button in the header', async () => {
  (useDecks as jest.Mock).mockReturnValue({ data: [deck('bio', 'Cell biology', 3)] });
  (useCards as jest.Mock).mockReturnValue({ data: [] });
  await render(<CoursesScreen />);
  await fireEvent.press(screen.getByRole('button', { name: 'New course' }));
  expect(router.push).toHaveBeenCalledWith('/create');
});

it('marks a course just made on the phone as new, once', async () => {
  (useDecks as jest.Mock).mockReturnValue({ data: [deck('bio', 'Cell biology', 3), deck('es', 'Spanish', 1)] });
  (useCards as jest.Mock).mockReturnValue({ data: [] });
  useCreateStore.setState({ justCreated: 'bio' });
  await render(<CoursesScreen />);
  expect(screen.getByLabelText('Cell biology, new')).toBeTruthy();
  expect(screen.getByLabelText('Spanish')).toBeTruthy();
  expect(useCreateStore.getState().justCreated).toBeNull();
});

it('shows due and mastered counts and starts studying the course', async () => {
  (useLocalSearchParams as jest.Mock).mockReturnValue({ id: 'bio' });
  (useDecks as jest.Mock).mockReturnValue({ data: [deck('bio', 'Cell biology', 3)] });
  (useCards as jest.Mock).mockReturnValue({
    data: [card('a', 'bio', -1, 3), card('b', 'bio', 9e9, MASTERED_INTERVAL_DAYS), card('c', 'bio', 9e9, MASTERED_INTERVAL_DAYS - 1)],
  });
  await render(<CourseDetailScreen />);
  expect(MASTERED_INTERVAL_DAYS).toBe(21);
  expect(screen.getByText('1 due')).toBeTruthy();
  expect(screen.getByText('1 mastered')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Study this course' }));
  expect(router.push).toHaveBeenCalledWith('/study/bio');
});
