import { buildCourse, createCourse, CreateError, type CourseDraft, type CourseSource } from '@bonamind/core';
import NetInfo from '@react-native-community/netinfo';
import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { RESUME_DELAY_MS, useCreateStore } from '../store';

jest.mock('@bonamind/core', () => ({ ...jest.requireActual('@bonamind/core'), buildCourse: jest.fn(), createCourse: jest.fn() }));
jest.mock('../ask', () => ({ ask: jest.fn() }));
jest.mock('../../data/supabase', () => ({ getSupabase: () => ({ tag: 'supabase' }) }));
jest.mock('../../data/app', () => ({ getData: () => ({ getFsrsProfile: async () => ({ profileLabel: 'fast-learner', weights: [1, 2] }) }) }));
type Net = { isConnected: boolean | null; isInternetReachable?: boolean | null };
let mockNetListener: ((s: Net) => void) | null = null;
let mockNetState: Net = { isConnected: false };
let mockActiveListeners = 0;
// Like the real library: a new listener is called at once with the current state.
jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn((l: (s: Net) => void) => {
    mockNetListener = l;
    mockActiveListeners += 1;
    l(mockNetState);
    return () => { mockActiveListeners -= 1; if (mockNetListener === l) mockNetListener = null; };
  }),
}));

const build = buildCourse as jest.Mock;
const save = createCourse as jest.Mock;
const source: CourseSource = { kind: 'text', text: 'Cells divide.', title: 'Cells', label: 'your PDF' };
const draft = (n = 3): CourseDraft => ({
  title: 'Cells', description: 'From your PDF', truncated: false, skippedPieces: 0,
  cards: Array.from({ length: n }, (_, i) => ({ front: `Q${i + 1}`, back: `A${i + 1}` })),
});
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const store = () => useCreateStore.getState();

beforeEach(() => {
  jest.clearAllMocks();
  mockNetListener = null;
  mockNetState = { isConnected: false };
  mockActiveListeners = 0;
  store().reset();
});

it('ignores a second start while building', async () => {
  build.mockReturnValue(new Promise(() => {}));
  store().start(async () => source, 'quick');
  store().start(async () => source, 'quick');
  await settle();
  expect(build).toHaveBeenCalledTimes(1);
  expect(store().phase).toBe('building');
});

it('shows reading while the source is fetched', async () => {
  store().start(() => new Promise(() => {}), 'standard');
  await settle();
  expect(store().progress).toEqual({ step: 'reading', cardsSoFar: 0, target: 20 });
  expect(build).not.toHaveBeenCalled();
});

it('passes progress through and lands in review with the draft', async () => {
  build.mockImplementation(async ({ onProgress }) => { onProgress({ step: 'writing', cardsSoFar: 1, target: 10 }); return draft(); });
  store().start(async () => source, 'quick');
  await settle();
  expect(build).toHaveBeenCalledWith(expect.objectContaining({ source, size: 'quick' }));
  expect(store().phase).toBe('review');
  expect(store().draft?.cards).toHaveLength(3);
});

it('keeps building after the screen unmounts', async () => {
  let finish: (d: CourseDraft) => void = () => {};
  build.mockReturnValue(new Promise<CourseDraft>((r) => { finish = r; }));
  function Screen() { return <Text>{useCreateStore((s) => s.phase)}</Text>; }
  const view = await render(<Screen />);
  await act(async () => { store().start(async () => source, 'quick'); });
  await settle();
  await view.unmount();
  await act(async () => { finish(draft()); });
  expect(store().phase).toBe('review');
  expect(store().draft?.title).toBe('Cells');
});

it('pauses for a connection and resumes without losing cards', async () => {
  jest.useFakeTimers();
  try {
    const partial = { donePieces: 1, cards: draft(5).cards };
    build.mockRejectedValueOnce(new CreateError('offline', 'gone', partial)).mockResolvedValueOnce(draft(10));
    store().start(async () => source, 'standard');
    await act(async () => { await jest.advanceTimersByTimeAsync(0); });
    expect(store().phase).toBe('waiting');
    expect(store().draft).toBeNull();
    await act(async () => { mockNetListener?.({ isConnected: true, isInternetReachable: true }); });
    await act(async () => { await jest.advanceTimersByTimeAsync(RESUME_DELAY_MS); });
    expect(build).toHaveBeenCalledTimes(2);
    expect(build.mock.calls[1][0]).toMatchObject({ source, size: 'standard', resume: partial });
    expect(store().phase).toBe('review');
    expect(mockActiveListeners).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

// NetInfo can report "connected" while requests still fail (captive portal,
// DNS). The listener fires at once on subscribe, so resuming immediately made
// a tight retry loop that leaked one listener per turn.
it('resumes once per pause, after a delay, even when NetInfo already says online', async () => {
  jest.useFakeTimers();
  try {
    mockNetState = { isConnected: true, isInternetReachable: true };
    const partial = { donePieces: 1, cards: draft(5).cards };
    build
      .mockRejectedValueOnce(new CreateError('offline', 'gone', partial))
      .mockRejectedValueOnce(new CreateError('offline', 'gone', partial))
      .mockResolvedValueOnce(draft(10));
    store().start(async () => source, 'standard');
    await act(async () => { await jest.advanceTimersByTimeAsync(0); });
    expect(store().phase).toBe('waiting');
    expect(build).toHaveBeenCalledTimes(1);
    await act(async () => { await jest.advanceTimersByTimeAsync(RESUME_DELAY_MS); });
    expect(build).toHaveBeenCalledTimes(2);
    expect(store().phase).toBe('waiting');
    expect(mockActiveListeners).toBeLessThanOrEqual(1);
    await act(async () => { await jest.advanceTimersByTimeAsync(RESUME_DELAY_MS); });
    expect(build).toHaveBeenCalledTimes(3);
    expect(store().phase).toBe('review');
    expect(mockActiveListeners).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

it('stays waiting while the internet is known to be unreachable', async () => {
  jest.useFakeTimers();
  try {
    mockNetState = { isConnected: true, isInternetReachable: false };
    build.mockRejectedValueOnce(new CreateError('offline', 'gone', { donePieces: 0, cards: [] }));
    store().start(async () => source, 'standard');
    await act(async () => { await jest.advanceTimersByTimeAsync(RESUME_DELAY_MS * 3); });
    expect(build).toHaveBeenCalledTimes(1);
    expect(store().phase).toBe('waiting');
  } finally {
    jest.useRealTimers();
  }
});

it('a 402 ends in error subscription', async () => {
  build.mockRejectedValueOnce(new CreateError('subscription'));
  store().start(async () => source, 'quick');
  await settle();
  expect(store()).toMatchObject({ phase: 'error', error: 'subscription' });
});

it('a reader failure ends in error with its kind', async () => {
  store().start(async () => { throw new CreateError('too_large'); }, 'quick');
  await settle();
  expect(store()).toMatchObject({ phase: 'error', error: 'too_large' });
  expect(build).not.toHaveBeenCalled();
});

it('remove, restore, edit and rename change the draft', async () => {
  build.mockResolvedValueOnce(draft(3));
  store().start(async () => source, 'quick');
  await settle();
  const second = store().draft!.cards[1];
  store().removeCard(1);
  expect(store().draft!.cards.map((c) => c.front)).toEqual(['Q1', 'Q3']);
  store().restoreCard(1, second);
  expect(store().draft!.cards.map((c) => c.front)).toEqual(['Q1', 'Q2', 'Q3']);
  store().editCard(0, { front: 'New Q', back: 'New A' });
  store().rename('Cell biology');
  expect(store().draft).toMatchObject({ title: 'Cell biology', cards: [{ front: 'New Q', back: 'New A' }, {}, {}] });
});

it('save success goes to ready with the new deck id', async () => {
  build.mockResolvedValueOnce(draft(2));
  save.mockResolvedValueOnce({ deck: { id: 'deck-9' }, cards: [] });
  store().start(async () => source, 'quick');
  await settle();
  const onSaved = jest.fn();
  await act(async () => { await store().save('u1', onSaved); });
  expect(save).toHaveBeenCalledWith({ tag: 'supabase' }, 'u1', expect.objectContaining({ title: 'Cells' }), { profileLabel: 'fast-learner', weightsOverride: [1, 2] });
  expect(store()).toMatchObject({ phase: 'ready', savedDeckId: 'deck-9' });
  expect(onSaved).toHaveBeenCalledWith('deck-9');
});

it('save failure keeps the draft and returns to review with an error', async () => {
  build.mockResolvedValueOnce(draft(2));
  save.mockRejectedValueOnce(new Error('insert failed'));
  store().start(async () => source, 'quick');
  await settle();
  await act(async () => { await store().save('u1', jest.fn()); });
  expect(store()).toMatchObject({ phase: 'review', error: 'busy' });
  expect(store().draft?.cards).toHaveLength(2);
});

it('never lets a stale source read replace the source of a newer build', async () => {
  jest.useFakeTimers();
  try {
    let finishOld: (s: CourseSource) => void = () => {};
    store().start(() => new Promise<CourseSource>((r) => { finishOld = r; }), 'standard');
    store().reset();
    const newer: CourseSource = { kind: 'text', text: 'Newer.', title: 'Newer', label: 'your PDF' };
    const partial = { donePieces: 0, cards: [] };
    build.mockRejectedValueOnce(new CreateError('offline', 'gone', partial)).mockResolvedValueOnce(draft(2));
    store().start(async () => newer, 'standard');
    await act(async () => { await jest.advanceTimersByTimeAsync(0); });
    await act(async () => { finishOld(source); await jest.advanceTimersByTimeAsync(0); });
    await act(async () => { mockNetListener?.({ isConnected: true }); await jest.advanceTimersByTimeAsync(RESUME_DELAY_MS); });
    expect(build.mock.calls[1][0].source).toBe(newer);
  } finally {
    jest.useRealTimers();
  }
});

it('saves a blank title as the one the course was made with', async () => {
  build.mockResolvedValueOnce(draft(2));
  save.mockResolvedValueOnce({ deck: { id: 'deck-9' }, cards: [] });
  store().start(async () => source, 'quick');
  await settle();
  store().rename('   ');
  await act(async () => { await store().save('u1', jest.fn()); });
  expect(save.mock.calls[0][2]).toMatchObject({ title: 'Cells' });
});
