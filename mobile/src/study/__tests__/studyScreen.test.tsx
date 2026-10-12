import type { Card } from '@bonamind/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StudyScreen } from '../StudyScreen';

const cards: Card[] = [
  { id: 'c1', deckId: 'bio', front: 'First question', back: 'A', nextReview: 0 },
  { id: 'c2', deckId: 'bio', front: 'Second question', back: 'B', nextReview: 0 },
];
const fetched = (data: unknown) => ({ data, isFetchedAfterMount: true, isError: false });

// The local save never settles: on a phone a slow (or failing) SQLite write
// held the next card back, so a swipe looked like it did nothing.
const mockEnqueueReview = jest.fn(() => new Promise<void>(() => {}));

jest.mock('expo-router', () => ({ router: { back: jest.fn() }, useLocalSearchParams: () => ({ deckId: 'bio' }) }));
jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('../../data/auth', () => ({ useAuth: () => ({ userId: 'u1', status: 'signed-in' }) }));
jest.mock('../../data/hooks', () => ({
  useCards: () => fetched(cards),
  useFsrsProfile: () => fetched({ profileLabel: null }),
  useSessions: () => fetched([]),
  useDecks: () => fetched([{ id: 'bio', title: 'Biology' }]),
}));
jest.mock('../../data/sync', () => ({ useSync: () => ({ online: true }), getSyncEngine: () => ({ notifyEnqueued: jest.fn() }) }));
jest.mock('../../data/app', () => ({ getOutbox: () => ({ enqueueReview: mockEnqueueReview, enqueueSession: jest.fn(async () => {}) }) }));
jest.mock('../useCloseOnLeave', () => ({ useCloseOnLeave: () => {} }));
jest.mock('../../design/motion', () => ({ useMotion: () => ({ reduce: true, spring: () => ({ duration: 180 }) }) }));
jest.mock('../../design/components/Confetti', () => ({ Confetti: () => null }));
jest.mock('../../design/components/LoadingScreen', () => ({ LoadingScreen: () => null }));
jest.mock('../../design/components/AuroraBackground', () => ({ auroraWarmth: { set: jest.fn() } }));
jest.mock('expo-glass-effect', () => ({ GlassView: 'GlassView', isLiquidGlassAvailable: () => false }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));
jest.mock('../CardStack', () => {
  const { Pressable, Text } = require('react-native');
  return {
    CardStack: ({ card, onRate }: { card: Card | null; onRate(r: number): void }) => (
      <Pressable accessibilityRole="button" onPress={() => onRate(require('@bonamind/core').Rating.GOOD)}><Text>{card?.front ?? 'no card'}</Text></Pressable>
    ),
  };
});

it('shows the next card as soon as a card is rated, without waiting for the save', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  await render(<QueryClientProvider client={client}><StudyScreen /></QueryClientProvider>);
  expect(screen.getByText('First question')).toBeTruthy();
  await fireEvent.press(screen.getByText('First question'));
  expect(mockEnqueueReview).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('Second question')).toBeTruthy();
});
