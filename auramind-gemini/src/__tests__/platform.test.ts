import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nativeState = vi.hoisted(() => ({ platform: 'web' as string }));

vi.mock('../lib/nativeShim', () => ({
  Capacitor: {
    isNativePlatform: () => nativeState.platform !== 'web',
    getPlatform: () => nativeState.platform,
  },
}));

async function load() {
  const mod = await import('../lib/platform');
  return mod;
}

describe('platform detection', () => {
  beforeEach(() => {
    nativeState.platform = 'web';
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.resetModules();
  });

  afterEach(() => {
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it('reports a browser tab as the web platform with no shell', async () => {
    const { appPlatform, isAppShell, isNativeApp, isDesktopApp } = await load();
    expect(appPlatform()).toBe('web');
    expect(isNativeApp()).toBe(false);
    expect(isDesktopApp()).toBe(false);
    expect(isAppShell()).toBe(false);
  });

  it('reports the phone apps as app shells, not desktop', async () => {
    for (const [platform, expected] of [
      ['android', 'android'],
      ['ios', 'ios'],
    ] as const) {
      nativeState.platform = platform;
      vi.resetModules();
      const { appPlatform, isDesktopApp, isAppShell, isNativeApp } = await load();
      expect(appPlatform()).toBe(expected);
      expect(isNativeApp()).toBe(true);
      expect(isDesktopApp()).toBe(false);
      expect(isAppShell()).toBe(true);
    }
  });

  it('reports the Windows app as a shell that still renders the web layout', async () => {
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const { appPlatform, isAppShell, isDesktopApp, isNativeApp } = await load();
    // Tauri serves the desktop (web) bundle, so the layout branch is "web"...
    expect(appPlatform()).toBe('web');
    expect(isNativeApp()).toBe(false);
    // ...but it is still an installed app from a fixed origin.
    expect(isDesktopApp()).toBe(true);
    expect(isAppShell()).toBe(true);
  });

  it('names the device it is actually running on', async () => {
    const { deviceName } = await load();
    expect(deviceName()).toBe('Android');

    nativeState.platform = 'ios';
    vi.resetModules();
    expect((await load()).deviceName()).toBe('iPhone');

    nativeState.platform = 'web';
    vi.resetModules();
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    // Regression: the Windows app reports appPlatform() "web", so without an
    // explicit branch this said "Android".
    expect((await load()).deviceName()).toBe('Windows');
  });
});
