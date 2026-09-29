import { describe, it, expect, vi, beforeEach } from 'vitest';

// Turnstile can never issue a token on capacitor://localhost, so the native
// shell must never require one. These tests pin that: native -> disabled
// even with a site key configured; web -> enabled only when the key exists.
//
// CLIENT_ENV is evaluated at import time, so each case resets modules,
// stubs the env, then dynamically imports the widget (same pattern as
// analyticsFunnel.test.ts).

const nativeState = vi.hoisted(() => ({ isNative: false }));

vi.mock('../lib/nativeShim', () => ({
  Capacitor: { isNativePlatform: () => nativeState.isNative },
}));

async function loadIsTurnstileEnabled(): Promise<() => boolean> {
  const mod = await import('../components/auth/TurnstileWidget');
  return mod.isTurnstileEnabled;
}

describe('isTurnstileEnabled', () => {
  beforeEach(() => {
    nativeState.isNative = false;
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('is disabled on native even with a site key configured', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '0x4AAAAAAAEsHm7dsqEhBi3Nr');
    nativeState.isNative = true;
    const isTurnstileEnabled = await loadIsTurnstileEnabled();
    expect(isTurnstileEnabled()).toBe(false);
  });

  it('is enabled on web when a site key is configured', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '0x4AAAAAAAEsHm7dsqEhBi3Nr');
    nativeState.isNative = false;
    const isTurnstileEnabled = await loadIsTurnstileEnabled();
    expect(isTurnstileEnabled()).toBe(true);
  });

  it('is disabled on web without a site key', async () => {
    vi.stubEnv('VITE_TURNSTILE_SITE_KEY', '');
    nativeState.isNative = false;
    const isTurnstileEnabled = await loadIsTurnstileEnabled();
    expect(isTurnstileEnabled()).toBe(false);
  });
});
