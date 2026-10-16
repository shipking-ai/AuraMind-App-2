import React from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// The CI live-boot gate reads what LiveActivityDriver records. It once
// scheduled its update on a timer started at mount, independent of its own
// start: on a slow simulator boot the bridge took longer than the timer to
// answer the earlier calls, the update reached the plugin before any activity
// existed, and the plugin answered updated:false (run 38197218275). These pin
// the order — the update goes out only after a confirmed start.

const la = vi.hoisted(() => ({
  isLiveActivityAvailable: vi.fn(async () => true),
  startLiveActivity: vi.fn(async () => true),
  updateLiveActivity: vi.fn(async () => true),
}));
const prefs = vi.hoisted(() => new Map<string, string>());
const session = vi.hoisted(() => ({
  startSessionLiveUpdate: vi.fn(async () => {}),
  updateSessionLiveUpdate: vi.fn(async () => {}),
  endSessionLiveUpdate: vi.fn(async () => {}),
}));

vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}) }));
vi.mock('../lib/liveActivity', () => la);
vi.mock('../lib/sessionLiveUpdate', () => session);
vi.mock('../lib/nativeShim', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
    isPluginAvailable: () => true,
  },
  Device: { getInfo: async () => ({ model: 'iPhone18,1', osVersion: '26.4.1' }) },
  Preferences: {
    set: async ({ key, value }: { key: string; value: string }) => {
      prefs.set(key, value);
    },
  },
}));

import IOSVisualPreview, {
  CI_LIVE_KEYS,
  LIVE_ACTIVITY_UPDATE_MS,
  LiveActivityDriver,
} from '../components/ios/IOSVisualPreview';

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/__preview/ios/session/neuro?live=1']}>
      <LiveActivityDriver />
    </MemoryRouter>,
  );

/** A bridge that takes `ms` to answer start, like the stalled CI boot. */
const slowStart = (ms: number, started = true) =>
  la.startLiveActivity.mockImplementationOnce(
    () => new Promise<boolean>((resolve) => setTimeout(() => resolve(started), ms)),
  );

describe('LiveActivityDriver', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    prefs.clear();
    Object.values(la).forEach((fn) => fn.mockClear());
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not update before its own start has resolved, however slow the bridge', async () => {
    slowStart(LIVE_ACTIVITY_UPDATE_MS * 2);
    mount();
    await act(() => vi.advanceTimersByTimeAsync(LIVE_ACTIVITY_UPDATE_MS + 100));
    expect(la.startLiveActivity).toHaveBeenCalledTimes(1);
    expect(la.updateLiveActivity).not.toHaveBeenCalled();
    expect(prefs.has(CI_LIVE_KEYS.updated)).toBe(false);

    // Start lands; the update follows one hold later, not before.
    await act(() => vi.advanceTimersByTimeAsync(LIVE_ACTIVITY_UPDATE_MS));
    expect(prefs.get(CI_LIVE_KEYS.started)).toBe('true');
    expect(la.updateLiveActivity).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(LIVE_ACTIVITY_UPDATE_MS));
    expect(la.updateLiveActivity).toHaveBeenCalledTimes(1);
    expect(la.updateLiveActivity).toHaveBeenCalledWith(expect.objectContaining({ done: 5 }));
    expect(prefs.get(CI_LIVE_KEYS.updated)).toBe('true');
  });

  it('records updated=false without asking the plugin when the start was refused', async () => {
    slowStart(10, false);
    mount();
    await act(() => vi.advanceTimersByTimeAsync(LIVE_ACTIVITY_UPDATE_MS * 3));
    expect(prefs.get(CI_LIVE_KEYS.started)).toBe('false');
    expect(la.updateLiveActivity).not.toHaveBeenCalled();
    expect(prefs.get(CI_LIVE_KEYS.updated)).toBe('false');
  });

  it('abandons the pending update when it unmounts', async () => {
    const view = mount();
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(prefs.get(CI_LIVE_KEYS.started)).toBe('true');
    view.unmount();
    await act(() => vi.advanceTimersByTimeAsync(LIVE_ACTIVITY_UPDATE_MS * 2));
    expect(la.updateLiveActivity).not.toHaveBeenCalled();
  });
});

describe('the preview study session', () => {
  // StudyModePage is lazy and heavy; load it up front so the render below
  // measures the page, not a cold import on a busy worker.
  beforeAll(() => import('../pages/study/StudyModePage'), 60000);

  it('leaves the Live Activity to the driver instead of starting its own', async () => {
    vi.useRealTimers();
    const view = render(
      <MemoryRouter initialEntries={['/__preview/ios/session/neuro']}>
        <Routes>
          <Route path="/__preview/ios/*" element={<IOSVisualPreview />} />
        </Routes>
      </MemoryRouter>,
    );
    // The page has rendered its preview cards, so its session effects ran.
    await view.findAllByText('What is long-term potentiation?', undefined, { timeout: 10000 });
    expect(session.startSessionLiveUpdate).not.toHaveBeenCalled();
    expect(la.startLiveActivity).not.toHaveBeenCalled();
    // Leaving the screen must not end an activity the page never owned.
    view.unmount();
    expect(session.endSessionLiveUpdate).not.toHaveBeenCalled();
  }, 20000);
});
