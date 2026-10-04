/**
 * Origin handling — the domain-rename surface.
 *
 * A domain change touches CORS, Stripe return URLs, and transactional email
 * links at the same time, and two of those fail silently rather than loudly.
 * These tests pin the behaviour so the failure mode is a red test instead of
 * a production report that "login just spins".
 */

import { describe, expect, it, afterEach, beforeEach, vi } from 'vitest';

describe('APP_ORIGIN', () => {
  beforeEach(() => {
    // Pin the ambient env to "unset" so these tests assert the real default
    // regardless of what the developer or CI runner has exported.
    vi.stubEnv('APP_ORIGIN', '');
    vi.stubEnv('RESEND_FROM_EMAIL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('defaults to the canonical production origin', async () => {
    vi.resetModules();
    const { APP_ORIGIN } = await import('../_lib/origin.js');
    expect(APP_ORIGIN).toBe('https://bonamind.app');
  });

  it('follows APP_ORIGIN so a domain change is one env var', async () => {
    vi.stubEnv('APP_ORIGIN', 'https://newname.app');
    vi.resetModules();
    const { APP_ORIGIN, appUrl } = await import('../_lib/origin.js');
    expect(APP_ORIGIN).toBe('https://newname.app');
    // And the URLs built from it follow without further edits.
    expect(appUrl('/dashboard')).toBe('https://newname.app/dashboard');
  });

  it('strips a trailing slash so appUrl() cannot produce a double slash', async () => {
    vi.stubEnv('APP_ORIGIN', 'https://newname.app/');
    vi.resetModules();
    const { APP_ORIGIN, appUrl } = await import('../_lib/origin.js');
    expect(APP_ORIGIN).toBe('https://newname.app');
    expect(appUrl('/dashboard')).toBe('https://newname.app/dashboard');
  });

  it('appUrl() accepts a path with or without a leading slash', async () => {
    vi.stubEnv('APP_ORIGIN', 'https://newname.app');
    vi.resetModules();
    const { appUrl } = await import('../_lib/origin.js');
    expect(appUrl('/subscribe')).toBe('https://newname.app/subscribe');
    expect(appUrl('subscribe')).toBe('https://newname.app/subscribe');
    expect(appUrl()).toBe('https://newname.app');
  });

  it('EMAIL_FROM is overridable independently of the app origin', async () => {
    // The sending domain is a deliverability/DNS decision and need not match
    // where the app is served, so it must not be derived from APP_ORIGIN.
    vi.stubEnv('APP_ORIGIN', 'https://newname.app');
    vi.stubEnv('RESEND_FROM_EMAIL', 'billing@newname.app');
    vi.resetModules();
    const { APP_ORIGIN, EMAIL_FROM } = await import('../_lib/origin.js');
    expect(APP_ORIGIN).toBe('https://newname.app');
    expect(EMAIL_FROM).toBe('billing@newname.app');
  });
});

describe('CORS allowlist follows APP_ORIGIN', () => {
  beforeEach(() => {
    // Pin APP_ORIGIN to the default regardless of the ambient environment.
    // LEGACY_APP_ORIGIN is deliberately NOT stubbed here: it is read with `??`,
    // so an empty string means "explicitly disabled" rather than "unset". Each
    // test below sets it only when it cares.
    vi.stubEnv('APP_ORIGIN', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('includes both the apex and www forms of the configured origin', async () => {
    vi.stubEnv('APP_ORIGIN', 'https://newname.app');
    vi.stubEnv('LEGACY_APP_ORIGIN', '');
    vi.resetModules();
    const { CORS_ORIGINS } = await import('../_middleware.js');
    expect(CORS_ORIGINS.has('https://newname.app')).toBe(true);
    expect(CORS_ORIGINS.has('https://www.newname.app')).toBe(true);
    // Legacy explicitly disabled above, so it must not appear.
    expect(CORS_ORIGINS.has('https://auramind.app')).toBe(false);
  });

  it('keeps the previous domain allowlisted during a migration', async () => {
    // Old receipts, bookmarks and shared links still point at auramind.app.
    // Dropping it the moment the default changed would turn a customer
    // following a link from a saved email into a silent network failure.
    vi.stubEnv('APP_ORIGIN', 'https://bonamind.app');
    vi.resetModules();
    const { CORS_ORIGINS } = await import('../_middleware.js');
    expect(CORS_ORIGINS.has('https://auramind.app')).toBe(true);
  });

  it('does not allowlist the legacy domain twice once APP_ORIGIN is itself legacy', async () => {
    // Otherwise a deployment that has not migrated ends up listing its own
    // origin as its own predecessor.
    vi.stubEnv('APP_ORIGIN', 'https://auramind.app');
    vi.resetModules();
    const { APP_ORIGIN, LEGACY_APP_ORIGIN } = await import('../_lib/origin.js');
    const { CORS_ORIGINS } = await import('../_middleware.js');
    expect(LEGACY_APP_ORIGIN).toBeUndefined();
    expect(CORS_ORIGINS.has(APP_ORIGIN)).toBe(true);
    // apex + www + the three native app shells. Anything more means the legacy
    // domain was added on top of an origin that is already itself.
    expect(CORS_ORIGINS.size).toBe(5);
  });

  it('keeps the three native app shells regardless of domain', async () => {
    vi.stubEnv('APP_ORIGIN', 'https://newname.app');
    vi.resetModules();
    const { CORS_ORIGINS } = await import('../_middleware.js');
    // These are Capacitor/Tauri webview origins; they never change with the
    // domain and losing them breaks the Android, iOS and Windows builds.
    expect(CORS_ORIGINS.has('https://localhost')).toBe(true);
    expect(CORS_ORIGINS.has('capacitor://localhost')).toBe(true);
    expect(CORS_ORIGINS.has('https://tauri.localhost')).toBe(true);
  });
});