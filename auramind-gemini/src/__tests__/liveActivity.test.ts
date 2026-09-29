import { beforeEach, describe, expect, it, vi } from 'vitest';

const plugin = {
  isSupported: vi.fn(async () => ({ supported: true, enabled: true })),
  start: vi.fn(async () => ({ started: true, id: 'a1' })),
  update: vi.fn(async () => ({ updated: true })),
  end: vi.fn(async () => {}),
};
const platform = { native: true, name: 'ios' };

vi.mock('@capacitor/core', () => ({ registerPlugin: () => plugin }));
vi.mock('../lib/nativeShim', () => ({
  Capacitor: {
    isNativePlatform: () => platform.native,
    getPlatform: () => platform.name,
  },
}));

const load = async () => {
  vi.resetModules();
  return import('../lib/liveActivity');
};

const session = { deckTitle: 'Neuro', total: 10, done: 3, again: 1 };

describe('liveActivity bridge', () => {
  beforeEach(() => {
    platform.native = true;
    platform.name = 'ios';
    Object.values(plugin).forEach((fn) => fn.mockClear());
  });

  it('starts a session on iOS', async () => {
    const la = await load();
    await expect(la.startLiveActivity(session)).resolves.toBe(true);
    expect(plugin.start).toHaveBeenCalledWith(session);
  });

  it('is available only when the system says supported AND permitted', async () => {
    const la = await load();
    expect(await la.isLiveActivityAvailable()).toBe(true);
    plugin.isSupported.mockResolvedValueOnce({ supported: true, enabled: false });
    expect(await la.isLiveActivityAvailable()).toBe(false);
  });

  it('skips identical updates and re-pushes when progress moves', async () => {
    const la = await load();
    await expect(la.updateLiveActivity(session)).resolves.toBe(true);
    await expect(la.updateLiveActivity({ ...session })).resolves.toBe(false);
    expect(plugin.update).toHaveBeenCalledTimes(1);
    await expect(la.updateLiveActivity({ ...session, done: 4 })).resolves.toBe(true);
    expect(plugin.update).toHaveBeenCalledTimes(2);
    await la.endLiveActivity();
    await la.updateLiveActivity({ ...session, done: 4 });
    expect(plugin.update).toHaveBeenCalledTimes(3); // ending clears the dedupe
  });

  it('is a no-op on Android and on the web', async () => {
    platform.name = 'android';
    let la = await load();
    await la.startLiveActivity(session);
    expect(await la.isLiveActivityAvailable()).toBe(false);

    platform.native = false;
    la = await load();
    await la.updateLiveActivity(session);
    await la.endLiveActivity();
    expect(plugin.start).not.toHaveBeenCalled();
    expect(plugin.update).not.toHaveBeenCalled();
    expect(plugin.end).not.toHaveBeenCalled();
  });

  it('survives a bridge that throws', async () => {
    plugin.start.mockRejectedValueOnce(new Error('no bridge'));
    plugin.isSupported.mockRejectedValueOnce(new Error('no bridge'));
    const la = await load();
    await expect(la.startLiveActivity(session)).resolves.toBe(false);
    expect(await la.isLiveActivityAvailable()).toBe(false);
  });
});
