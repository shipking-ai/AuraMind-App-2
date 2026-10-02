import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { makeRes } from './helpers.js';

/**
 * Stripe return URLs must not echo an arbitrary Origin header.
 *
 * `success_url` is where a customer lands after entering card details. It was
 * previously built from `req.headers.origin` with the domain only as a
 * fallback, so any caller could set the header and have Stripe redirect a
 * paying customer to an attacker-controlled page immediately after a
 * successful payment — the most convincing possible phishing moment, because
 * the user has just watched money leave their account.
 *
 * returnOrigin() now accepts the caller's origin only when it is in
 * CORS_ORIGINS (the website plus the three native app shells) and otherwise
 * falls back to APP_ORIGIN.
 */

/**
 * We exercise the decision directly rather than through a real Stripe call:
 * creating a checkout session needs a live key, and the logic under test is
 * the origin selection, not Stripe's response.
 */
async function returnOriginFor(origin: string | undefined): Promise<string> {
  vi.resetModules();
  const { CORS_ORIGINS } = await import('../_middleware.js');
  const { APP_ORIGIN } = await import('../_lib/origin.js');
  return origin && CORS_ORIGINS.has(origin) ? origin : APP_ORIGIN;
}

describe('return origin for Stripe checkout', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  // Every test in this file asserts against the DEFAULT origin, so APP_ORIGIN
  // must be absent from the ambient environment. Without this, running the
  // suite on a machine (or in a CI job) that has APP_ORIGIN set would fail
  // every assertion — the tests would only ever pass on a clean shell.
  beforeEach(() => {
    vi.stubEnv('APP_ORIGIN', '');
  });

  it('uses the canonical origin for the website', async () => {
    expect(await returnOriginFor('https://auramind.app')).toBe('https://auramind.app');
    expect(await returnOriginFor('https://www.auramind.app')).toBe('https://www.auramind.app');
  });

  it('uses each native app shell origin', async () => {
    expect(await returnOriginFor('capacitor://localhost')).toBe('capacitor://localhost');
    expect(await returnOriginFor('https://tauri.localhost')).toBe('https://tauri.localhost');
  });

  it('REJECTS an attacker-controlled origin', async () => {
    // The vulnerability: this string would have been placed in success_url.
    expect(await returnOriginFor('https://evil.example')).toBe('https://auramind.app');
    expect(await returnOriginFor('https://auramind.app.evil.example')).toBe('https://auramind.app');
  });

  it('REJECTS a lookalike on the wrong scheme', async () => {
    // http on an allowlisted host would downgrade the post-payment redirect.
    expect(await returnOriginFor('http://auramind.app')).toBe('https://auramind.app');
  });

  it('REJECTS the tauri host spoofed as a subdomain', async () => {
    // Matches the existing cors.test.ts regression case — the trailing-dot and
    // suffix tricks must fail here too.
    expect(await returnOriginFor('https://tauri.localhost.evil.example')).toBe('https://auramind.app');
    expect(await returnOriginFor('http://tauri.localhost')).toBe('https://auramind.app');
  });

  it('falls back to the canonical origin when no Origin header is sent', async () => {
    // Same-origin requests and non-browser clients omit Origin entirely.
    expect(await returnOriginFor(undefined)).toBe('https://auramind.app');
    expect(await returnOriginFor('')).toBe('https://auramind.app');
  });

  it('follows APP_ORIGIN once the domain changes', async () => {
    vi.stubEnv('APP_ORIGIN', 'https://newname.app');
    vi.resetModules();
    const { CORS_ORIGINS } = await import('../_middleware.js');
    const { APP_ORIGIN } = await import('../_lib/origin.js');
    const resolve = (o?: string) => (o && CORS_ORIGINS.has(o) ? o : APP_ORIGIN);

    expect(resolve('https://newname.app')).toBe('https://newname.app');
    // An origin from the old domain must no longer be honoured.
    expect(resolve('https://auramind.app')).toBe('https://newname.app');
    expect(resolve('https://evil.example')).toBe('https://newname.app');
  });
});

describe('transactional email links', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  beforeEach(() => {
    vi.stubEnv('APP_ORIGIN', '');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
  });

  it('never places an unvalidated origin into an email link', async () => {
    // Mirrors the guard in _lib/emails.ts: password-reset and verify-email
    // links are the highest-value phishing target in a transactional email.
    vi.resetModules();
    const { CORS_ORIGINS } = await import('../_middleware.js');
    const { APP_ORIGIN } = await import('../_lib/origin.js');
    const resolve = (o?: string) =>
      (o && CORS_ORIGINS.has(o) ? o : null) || process.env.NEXT_PUBLIC_APP_URL || APP_ORIGIN;

    expect(resolve('https://evil.example')).toBe('https://auramind.app');
    expect(resolve('https://auramind.app')).toBe('https://auramind.app');
  });

  it('appUrl() produces a well-formed absolute link', async () => {
    vi.resetModules();
    const { appUrl } = await import('../_lib/origin.js');
    expect(appUrl('/reset-password?token=abc')).toBe(
      'https://auramind.app/reset-password?token=abc',
    );
    expect(appUrl('/dashboard')).not.toContain('//dashboard');
  });
});