import type { CourseDraft } from '@bonamind/core';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { CREATE_COPY } from '../copy';
import { ReviewDeck } from '../ReviewDeck';
import { useCreateStore } from '../store';

jest.mock('../../design/motion', () => ({ useMotion: () => ({ reduce: true, spring: () => ({ duration: 180 }) }) }));
jest.mock('../../design/haptics', () => ({ haptic: jest.fn() }));
jest.mock('../../data/auth', () => ({ useAuth: () => ({ userId: 'u1', status: 'signed-in' }) }));
jest.mock('../../data/supabase', () => ({ getSupabase: () => ({}) }));
jest.mock('../../data/app', () => ({ getData: () => ({}) }));

const pan = (dx: number) => [
  { state: State.BEGAN, translationX: 0, translationY: 0 },
  { state: State.ACTIVE, translationX: dx / 2, translationY: 0 },
  { state: State.END, translationX: dx, translationY: 0, velocityX: 0, velocityY: 0 },
];
const draft = (over: Partial<CourseDraft> = {}): CourseDraft => ({
  title: 'Cells', description: '', truncated: false, skippedPieces: 0,
  cards: [{ front: 'Q1', back: 'A1' }, { front: 'Q2', back: 'A2' }, { front: 'Q3', back: 'A3' }],
  ...over,
});
const mockSave = jest.fn(async (_userId: string, onSaved: (id: string) => void) => { onSaved('deck-1'); });
let client: QueryClient;
const render = (ui: ReactElement) => rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
const fronts = () => useCreateStore.getState().draft!.cards.map((c) => c.front);

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  useCreateStore.getState().reset();
  useCreateStore.setState({ phase: 'review', draft: draft(), save: mockSave });
});

it('shows the first card, the count and the title', async () => {
  await render(<ReviewDeck />);
  expect(screen.getByLabelText('Question: Q1')).toBeTruthy();
  expect(screen.getByText("3 cards · swipe away any you don't want")).toBeTruthy();
  expect(screen.getByLabelText('Course title').props.value).toBe('Cells');
});

it('swiping left removes a card and offers Undo for 4 s', async () => {
  jest.useFakeTimers();
  try {
    await render(<ReviewDeck />);
    fireGestureHandler(getByGestureTestId('review-pan'), pan(-140));
    await waitFor(() => expect(fronts()).toEqual(['Q2', 'Q3']));
    expect(screen.getByLabelText('Question: Q2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
    await act(async () => { jest.advanceTimersByTime(4_000); });
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  } finally {
    jest.useRealTimers();
  }
});

it('Undo puts the removed card back where it was', async () => {
  await render(<ReviewDeck />);
  fireGestureHandler(getByGestureTestId('review-pan'), pan(-140));
  await waitFor(() => expect(fronts()).toEqual(['Q2', 'Q3']));
  await fireEvent.press(screen.getByRole('button', { name: 'Undo' }));
  expect(fronts()).toEqual(['Q1', 'Q2', 'Q3']);
  expect(screen.getByLabelText('Question: Q1')).toBeTruthy();
});

it('swiping right keeps it and shows the next', async () => {
  await render(<ReviewDeck />);
  fireGestureHandler(getByGestureTestId('review-pan'), pan(140));
  expect(await screen.findByLabelText('Question: Q2')).toBeTruthy();
  expect(fronts()).toEqual(['Q1', 'Q2', 'Q3']);
});

it('tapping turns the card to its answer', async () => {
  await render(<ReviewDeck />);
  fireGestureHandler(getByGestureTestId('review-tap'));
  expect(await screen.findByLabelText('Answer: A1')).toBeTruthy();
});

it('long-press opens the editor and saves edits', async () => {
  await render(<ReviewDeck />);
  fireGestureHandler(getByGestureTestId('review-long'), [{ state: State.BEGAN }, { state: State.ACTIVE }, { state: State.END }]);
  await fireEvent.changeText(await screen.findByLabelText('Question'), 'What is a cell?');
  await fireEvent.changeText(screen.getByLabelText('Answer'), 'The unit of life');
  await fireEvent.press(screen.getByRole('button', { name: 'Save card' }));
  expect(useCreateStore.getState().draft!.cards[0]).toEqual({ front: 'What is a cell?', back: 'The unit of life' });
  expect(screen.queryByLabelText('Question')).toBeNull();
});

it('renames the course from the title', async () => {
  await render(<ReviewDeck />);
  await fireEvent.changeText(screen.getByLabelText('Course title'), 'Cell biology');
  expect(useCreateStore.getState().draft!.title).toBe('Cell biology');
});

it('Keep all skips to the end and Save course saves for the user', async () => {
  await render(<ReviewDeck />);
  await fireEvent.press(screen.getByRole('button', { name: 'Keep all' }));
  expect(screen.getByText('All 3 cards reviewed')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Save course' }));
  expect(mockSave).toHaveBeenCalledWith('u1', expect.any(Function));
});

it('shows the partial note when pieces were skipped or truncated', async () => {
  useCreateStore.setState({ draft: draft({ skippedPieces: 1 }) });
  await render(<ReviewDeck />);
  expect(screen.getByText(CREATE_COPY.partial)).toBeTruthy();
});

it('shows the save error with Try saving again', async () => {
  useCreateStore.setState({ error: 'busy' });
  await render(<ReviewDeck />);
  expect(screen.getByText(CREATE_COPY.errors.busy)).toBeTruthy();
  expect(screen.getByRole('button', { name: CREATE_COPY.saveRetry })).toBeTruthy();
});

it('will not save a course with every card removed', async () => {
  useCreateStore.setState({ draft: draft({ cards: [] }) });
  await render(<ReviewDeck />);
  expect(screen.getByText('Every card was removed. Keep at least one to save.')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Save course' }));
  expect(mockSave).not.toHaveBeenCalled();
});

it('refreshes courses and cards once the course is saved', async () => {
  const invalidate = jest.spyOn(client, 'invalidateQueries');
  await render(<ReviewDeck />);
  await fireEvent.press(screen.getByRole('button', { name: 'Save course' }));
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['decks'] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['cards'] });
});

// The card key included its front text, so saving an edit remounted it: it
// played the swipe-away animation and flipped back to the question.
it('keeps the card in place, on the side it was on, after an edit', async () => {
  await render(<ReviewDeck />);
  fireGestureHandler(getByGestureTestId('review-tap'));
  await screen.findByLabelText('Answer: A1');
  fireGestureHandler(getByGestureTestId('review-long'), [{ state: State.BEGAN }, { state: State.ACTIVE }, { state: State.END }]);
  await fireEvent.changeText(await screen.findByLabelText('Question'), 'What is a cell?');
  await fireEvent.changeText(screen.getByLabelText('Answer'), 'The unit of life');
  await fireEvent.press(screen.getByRole('button', { name: 'Save card' }));
  expect(screen.getByLabelText('Answer: The unit of life')).toBeTruthy();
});
