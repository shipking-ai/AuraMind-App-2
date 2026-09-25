import { describe, it, expect, vi } from 'vitest';

// The CI simulator tour ends on a live study session that drives a real
// Live Activity. These pin the tour wiring: the live step is last, tour
// navigation preserves its query string, and the driven update fires inside
// the step's hold time.

vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}) }));
vi.mock('../lib/nativeShim', () => ({
  Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' },
}));

import {
  IOS_PREVIEW_BASE,
  IOS_PREVIEW_LIVE_STEP,
  IOS_PREVIEW_STEP_MS,
  IOS_PREVIEW_TOUR,
  LIVE_ACTIVITY_UPDATE_MS,
  previewTourUrl,
} from '../components/ios/IOSVisualPreview';

describe('iOS preview tour Live Activity finale', () => {
  it('ends on the live session step', () => {
    expect(IOS_PREVIEW_TOUR[IOS_PREVIEW_TOUR.length - 1]).toBe(IOS_PREVIEW_LIVE_STEP);
    expect(IOS_PREVIEW_LIVE_STEP).toContain('live=1');
  });

  it('preserves a step query string when adding tour=1', () => {
    expect(previewTourUrl('/session/neuro?live=1')).toBe(
      `${IOS_PREVIEW_BASE}/session/neuro?live=1&tour=1`,
    );
    expect(previewTourUrl('/decks')).toBe(`${IOS_PREVIEW_BASE}/decks?tour=1`);
  });

  it('fires the driven update inside the step hold', () => {
    expect(LIVE_ACTIVITY_UPDATE_MS).toBeLessThan(IOS_PREVIEW_STEP_MS);
  });

  it('live-boot opens straight on the driven session (CI, no tour timing)', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_IOS_PREVIEW', 'live');
    const mod = await import('../components/ios/IOSVisualPreview');
    expect(mod.isLiveBoot()).toBe(true);
  });

  it('regular preview and release builds do not live-boot', async () => {
    vi.resetModules();
    vi.stubEnv('VITE_IOS_PREVIEW', 'true');
    expect((await import('../components/ios/IOSVisualPreview')).isLiveBoot()).toBe(false);
    vi.resetModules();
    vi.stubEnv('VITE_IOS_PREVIEW', '');
    expect((await import('../components/ios/IOSVisualPreview')).isLiveBoot()).toBe(false);
    vi.unstubAllEnvs();
  });
});
