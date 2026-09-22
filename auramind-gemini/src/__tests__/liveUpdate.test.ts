import { beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = {
  isSupported: vi.fn(async () => ({ supported: true, promoted: true })),
  start: vi.fn(async () => ({ posted: true })),
  update: vi.fn(async () => ({ posted: true })),
  end: vi.fn(async () => {}),
};
const platform = { native: true, name: 'android' };

vi.mock('@capacitor/core', () => ({ registerPlugin: () => plugin }));
vi.mock('../lib/nativeShim', () => ({
  Capacitor: {
    isNativePlatform: () => platform.native,
    getPlatform: () => platform.name,
  },
}));

const load = async () => {
  vi.resetModules();
  return import('../lib/liveUpdate');
};

const session = { deckTitle: 'Neuro', total: 10, done: 3, againAt: [2] };

describe('liveUpdate bridge', () => {
  beforeEach(() => {
    platform.native = true;
    platform.name = 'android';
    Object.values(plugin).forEach((fn) => fn.mockClear());
  });

  it('posts sessions on Android', async () => {
    const lu = await load();
    await lu.startLiveUpdate(session);
    expect(plugin.start).toHaveBeenCalledWith(session);
    expect(await lu.isLiveUpdateSupported()).toBe(true);
  });

  it('skips identical updates and re-posts when progress moves', async () => {
    const lu = await load();
    await lu.updateLiveUpdate(session);
    await lu.updateLiveUpdate({ ...session });
    expect(plugin.update).toHaveBeenCalledTimes(1);
    await lu.updateLiveUpdate({ ...session, done: 4 });
    expect(plugin.update).toHaveBeenCalledTimes(2);
    await lu.endLiveUpdate();
    await lu.updateLiveUpdate({ ...session, done: 4 });
    expect(plugin.update).toHaveBeenCalledTimes(3); // ending clears the dedupe
  });

  it('is a no-op off Android, even on another native platform', async () => {
    platform.name = 'ios';
    const lu = await load();
    await lu.startLiveUpdate(session);
    await lu.updateLiveUpdate(session);
    await lu.endLiveUpdate();
    expect(await lu.isLiveUpdateSupported()).toBe(false);
    expect(plugin.start).not.toHaveBeenCalled();
    expect(plugin.update).not.toHaveBeenCalled();
    expect(plugin.end).not.toHaveBeenCalled();
  });

  it('survives a bridge that throws', async () => {
    plugin.start.mockRejectedValueOnce(new Error('no bridge'));
    plugin.isSupported.mockRejectedValueOnce(new Error('no bridge'));
    const lu = await load();
    await expect(lu.startLiveUpdate(session)).resolves.toBeUndefined();
    expect(await lu.isLiveUpdateSupported()).toBe(false);
  });
});
