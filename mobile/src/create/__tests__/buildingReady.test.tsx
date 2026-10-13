import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { haptic } from '../../design/haptics';
import { BuildingView } from '../BuildingView';
import { CREATE_COPY } from '../copy';
import { ReadyView } from '../ReadyView';
import { useCreateStore } from '../store';

let mockReduce = false;
jest.mock('../../design/motion', () => ({ useMotion: () => ({ reduce: mockReduce, spring: () => ({ damping: 12, stiffness: 140 }) }) }));
jest.mock('../../design/haptics', () => ({ haptic: jest.fn() }));
jest.mock('../../design/components/LoadingScreen', () => {
  const { View } = require('react-native');
  return { Prism: () => <View testID="prism" /> };
});
jest.mock('../../design/components/Confetti', () => {
  const { View } = require('react-native');
  return { Confetti: () => <View testID="confetti" /> };
});
jest.mock('../../data/supabase', () => ({ getSupabase: () => ({}) }));
jest.mock('../../data/app', () => ({ getData: () => ({}) }));

const draft = { title: 'Cells', description: '', truncated: false, skippedPieces: 0, cards: Array.from({ length: 19 }, (_, i) => ({ front: `Q${i}`, back: `A${i}` })) };

beforeEach(() => {
  jest.clearAllMocks();
  mockReduce = false;
  useCreateStore.getState().reset();
});

it('ticks steps and shows "Writing card N of M"', async () => {
  useCreateStore.setState({ phase: 'building', progress: { step: 'writing', cardsSoFar: 7, target: 20 } });
  await render(<BuildingView />);
  expect(screen.getByText('Building your course')).toBeTruthy();
  expect(screen.getByText('Writing card 7 of 20')).toBeTruthy();
  expect(screen.getByLabelText('Reading your source, done')).toBeTruthy();
  expect(screen.getByLabelText('Finding key ideas, done')).toBeTruthy();
  expect(screen.getByRole('progressbar').props.accessibilityValue).toMatchObject({ now: 35 });
});

it('gives a selection tap when a step finishes', async () => {
  useCreateStore.setState({ phase: 'building', progress: { step: 'reading', cardsSoFar: 0, target: 20 } });
  await render(<BuildingView />);
  (haptic as jest.Mock).mockClear();
  await act(async () => { useCreateStore.setState({ progress: { step: 'ideas', cardsSoFar: 0, target: 20 } }); });
  await screen.findByLabelText('Reading your source, done');
  expect(haptic).toHaveBeenCalledWith('selection');
});

it('shows waiting copy while paused for a connection', async () => {
  useCreateStore.setState({ phase: 'waiting', progress: { step: 'writing', cardsSoFar: 5, target: 20 } });
  await render(<BuildingView />);
  expect(screen.getByText(CREATE_COPY.waiting)).toBeTruthy();
});

it('stacks the latest card as it lands', async () => {
  useCreateStore.setState({ phase: 'building', progress: { step: 'writing', cardsSoFar: 3, target: 20, latest: { front: 'What did the Tennis Court Oath promise?', back: 'A constitution' } } });
  await render(<BuildingView />);
  expect(screen.getByText('What did the Tennis Court Oath promise?')).toBeTruthy();
});

it('ready shows the count and title and routes the buttons', async () => {
  useCreateStore.setState({ phase: 'ready', draft, savedDeckId: 'deck-9' });
  const onStudy = jest.fn();
  const onDone = jest.fn();
  await render(<ReadyView onStudy={onStudy} onDone={onDone} />);
  expect(screen.getByText('Course ready')).toBeTruthy();
  expect(screen.getByText('19 cards in Cells')).toBeTruthy();
  expect(screen.getByText('Also on bonamind.app')).toBeTruthy();
  expect(screen.getByTestId('confetti')).toBeTruthy();
  expect(haptic).toHaveBeenCalledWith('success');
  await fireEvent.press(screen.getByRole('button', { name: 'Study now' }));
  expect(onStudy).toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
  expect(onDone).toHaveBeenCalled();
});

it('skips confetti under Reduce Motion', async () => {
  mockReduce = true;
  useCreateStore.setState({ phase: 'ready', draft, savedDeckId: 'deck-9' });
  await render(<ReadyView onStudy={() => {}} onDone={() => {}} />);
  expect(screen.queryByTestId('confetti')).toBeNull();
});
