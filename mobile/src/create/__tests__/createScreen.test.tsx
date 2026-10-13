import { CreateError } from '@bonamind/core';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { CreateScreen } from '../CreateScreen';
import { CREATE_COPY } from '../copy';
import { pickPhotos } from '../sources';
import { useCreateStore } from '../store';

let mockOnline = true;
jest.mock('../../data/sync', () => ({ useSync: () => ({ online: mockOnline }) }));
jest.mock('../../data/auth', () => ({ useAuth: () => ({ userId: 'u1', status: 'signed-in' }) }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() } }));
jest.mock('../../design/components/LoadingScreen', () => ({ Prism: () => null }));
jest.mock('../../design/components/Confetti', () => ({ Confetti: () => null }));
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn(async () => '') }));
jest.mock('../sources', () => ({
  ...jest.requireActual('../sources'),
  pickPdf: jest.fn(async () => ({ name: 'Cells.pdf', size: 1000, uri: 'file://c.pdf' })),
  pickPhotos: jest.fn(async () => [{ uri: 'file://p1', width: 10, height: 10 }]),
}));
jest.mock('../../design/motion', () => ({ useMotion: () => ({ reduce: true, spring: () => ({ duration: 180 }) }) }));
jest.mock('../../design/haptics', () => ({ haptic: jest.fn() }));
jest.mock('../../design/components/AuroraBackground', () => ({ AuroraBackground: () => null }));
jest.mock('expo-glass-effect', () => ({ GlassView: 'GlassView', isLiquidGlassAvailable: () => false }));
jest.mock('expo-blur', () => ({ BlurView: 'BlurView' }));
jest.mock('expo-symbols', () => ({ SymbolView: 'SymbolView' }));

const mockStart = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  mockOnline = true;
  useCreateStore.getState().reset();
  useCreateStore.setState({ start: mockStart });
});

const tile = (name: string) => screen.getByRole('button', { name });
const make = () => screen.getByRole('button', { name: CREATE_COPY.make });

it('switches the input when a source tile is chosen', async () => {
  await render(<CreateScreen />);
  expect(screen.getByLabelText('Your topic')).toBeTruthy();
  await fireEvent.press(tile('Link or video'));
  expect(await screen.findByLabelText('Link')).toBeTruthy();
  await fireEvent.press(tile('PDF'));
  expect(screen.getByRole('button', { name: 'Choose a PDF' })).toBeTruthy();
  await fireEvent.press(tile('Photo'));
  expect(screen.getByRole('button', { name: 'Take photo' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Choose photos' })).toBeTruthy();
});

it('prefills only http(s) URLs from the clipboard', async () => {
  (Clipboard.getStringAsync as jest.Mock).mockResolvedValueOnce('just some notes');
  const view = await render(<CreateScreen />);
  await fireEvent.press(tile('Link or video'));
  await waitFor(() => expect(Clipboard.getStringAsync).toHaveBeenCalled());
  expect(screen.getByLabelText('Link').props.value).toBe('');
  await view.unmount();
  (Clipboard.getStringAsync as jest.Mock).mockResolvedValueOnce('https://example.com/a');
  await render(<CreateScreen />);
  await fireEvent.press(tile('Link or video'));
  await waitFor(() => expect(screen.getByLabelText('Link').props.value).toBe('https://example.com/a'));
});

it('defaults to Standard and starts a build with the chosen source and size', async () => {
  await render(<CreateScreen />);
  expect(screen.getByRole('tab', { name: 'Standard' }).props.accessibilityState).toMatchObject({ selected: true });
  await fireEvent.changeText(screen.getByLabelText('Your topic'), 'The French Revolution');
  await fireEvent.press(screen.getByRole('tab', { name: 'Deep' }));
  await fireEvent.press(make());
  expect(mockStart).toHaveBeenCalledWith(expect.any(Function), 'deep');
  await expect(mockStart.mock.calls[0][0]()).resolves.toEqual({ kind: 'topic', topic: 'The French Revolution' });
});

it('asks for input instead of starting with nothing', async () => {
  await render(<CreateScreen />);
  await fireEvent.press(make());
  expect(mockStart).not.toHaveBeenCalled();
  expect(screen.getByText('Add a topic first.')).toBeTruthy();
});

it('says to connect when offline and does not start', async () => {
  mockOnline = false;
  await render(<CreateScreen />);
  await fireEvent.changeText(screen.getByLabelText('Your topic'), 'Cells');
  await fireEvent.press(screen.getByRole('button', { name: CREATE_COPY.offlineButton }));
  expect(mockStart).not.toHaveBeenCalled();
});

it('shows the Pro label after a subscription error', async () => {
  useCreateStore.setState({ phase: 'error', error: 'subscription' });
  await render(<CreateScreen />);
  expect(screen.getByRole('button', { name: CREATE_COPY.proButton })).toBeTruthy();
  expect(screen.getByText(CREATE_COPY.errors.subscription)).toBeTruthy();
});

it('words an unreadable source for the source that failed', async () => {
  useCreateStore.setState({ phase: 'error', error: 'unreadable' });
  await render(<CreateScreen />);
  await fireEvent.press(tile('PDF'));
  expect(screen.getByText(CREATE_COPY.unreadable.pdf)).toBeTruthy();
});

it('caps photos at 5 and removes a page on its close button', async () => {
  (pickPhotos as jest.Mock).mockResolvedValueOnce(Array.from({ length: 5 }, (_, i) => ({ uri: `file://p${i}`, width: 10, height: 10 })));
  await render(<CreateScreen />);
  await fireEvent.press(tile('Photo'));
  await fireEvent.press(screen.getByRole('button', { name: 'Choose photos' }));
  expect(await screen.findAllByLabelText(/^Remove page/)).toHaveLength(5);
  expect(screen.queryByRole('button', { name: 'Choose photos' })).toBeNull();
  await fireEvent.press(screen.getByLabelText('Remove page 2'));
  expect(screen.getAllByLabelText(/^Remove page/)).toHaveLength(4);
  expect(screen.getByRole('button', { name: 'Choose photos' })).toBeTruthy();
});

it('can paste text when a link cannot be read', async () => {
  await render(<CreateScreen />);
  await fireEvent.press(tile('Link or video'));
  await fireEvent.press(screen.getByRole('button', { name: CREATE_COPY.pasteInstead }));
  await fireEvent.changeText(screen.getByLabelText('Text'), 'Cells divide by mitosis.');
  await fireEvent.press(make());
  await expect(mockStart.mock.calls[0][0]()).resolves.toEqual({ kind: 'text', text: 'Cells divide by mitosis.', title: 'Cells divide by mitosis.', label: 'your text' });
  expect(CreateError).toBeDefined();
});

describe('after starting', () => {
  const { router } = jest.requireMock('expo-router') as { router: { back: jest.Mock; replace: jest.Mock } };
  const draft = { title: 'Cells', description: '', truncated: false, skippedPieces: 0, cards: [{ front: 'Q', back: 'A' }] };

  it('shows the live build while building or waiting', async () => {
    useCreateStore.setState({ phase: 'building', progress: { step: 'reading', cardsSoFar: 0, target: 20 } });
    await render(<CreateScreen />);
    expect(screen.getByText('Building your course')).toBeTruthy();
    expect(screen.queryByRole('button', { name: CREATE_COPY.make })).toBeNull();
  });

  it('Study now opens the new course and clears the build', async () => {
    useCreateStore.setState({ phase: 'ready', draft, savedDeckId: 'deck-9' });
    await render(<CreateScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Study now' }));
    expect(router.replace).toHaveBeenCalledWith('/study/deck-9');
    expect(useCreateStore.getState().phase).toBe('input');
  });

  it('Done closes the sheet and clears the build', async () => {
    useCreateStore.setState({ phase: 'ready', draft, savedDeckId: 'deck-9' });
    await render(<CreateScreen />);
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(router.back).toHaveBeenCalled();
    expect(useCreateStore.getState().phase).toBe('input');
  });
});
