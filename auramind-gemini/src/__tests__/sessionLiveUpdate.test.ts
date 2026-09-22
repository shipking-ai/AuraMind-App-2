import { beforeEach, describe, expect, it, vi } from 'vitest';

const android = {
  startLiveUpdate: vi.fn(async () => {}),
  updateLiveUpdate: vi.fn(async () => {}),
  endLiveUpdate: vi.fn(async () => {}),
};
const ios = {
  startLiveActivity: vi.fn(async () => {}),
  updateLiveActivity: vi.fn(async () => {}),
  endLiveActivity: vi.fn(async () => {}),
};

vi.mock('../lib/liveUpdate', () => android);
vi.mock('../lib/liveActivity', () => ios);

const progress = {
  deckTitle: 'Neuro',
  deckId: 'd1',
  total: 10,
  done: 4,
  againAt: [2, 3],
};

describe('sessionLiveUpdate', () => {
  beforeEach(() => {
    [...Object.values(android), ...Object.values(ios)].forEach((fn) => fn.mockClear());
  });

  it('gives Android the dot positions and a deep link back into the deck', async () => {
    const { startSessionLiveUpdate } = await import('../lib/sessionLiveUpdate');
    await startSessionLiveUpdate(progress);
    expect(android.startLiveUpdate).toHaveBeenCalledWith({
      deckTitle: 'Neuro',
      total: 10,
      done: 4,
      againAt: [2, 3],
      deepLink: 'auramind://app/dashboard/study/d1',
    });
  });

  it('gives iOS the count, because the activity draws a number', async () => {
    const { updateSessionLiveUpdate } = await import('../lib/sessionLiveUpdate');
    await updateSessionLiveUpdate(progress);
    expect(ios.updateLiveActivity).toHaveBeenCalledWith({
      deckTitle: 'Neuro',
      total: 10,
      done: 4,
      again: 2,
    });
  });

  it('ends both surfaces', async () => {
    const { endSessionLiveUpdate } = await import('../lib/sessionLiveUpdate');
    await endSessionLiveUpdate();
    expect(android.endLiveUpdate).toHaveBeenCalled();
    expect(ios.endLiveActivity).toHaveBeenCalled();
  });
});
