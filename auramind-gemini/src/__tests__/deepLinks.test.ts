import { describe, it, expect } from 'vitest';
import { parseDeepLink } from '../lib/deepLinks';

describe('parseDeepLink', () => {
  it('routes launcher shortcuts to their destinations', () => {
    expect(parseDeepLink('auramind://app/dashboard/study')).toBe('/dashboard/study'); // legacy-name: ok
    expect(parseDeepLink('auramind://app/generator')).toBe('/dashboard/generator'); // legacy-name: ok
    expect(parseDeepLink('auramind://app/dashboard/chat')).toBe('/dashboard/chat'); // legacy-name: ok
  });

  it('normalizes bare top-level prefixes that would otherwise 404', () => {
    expect(parseDeepLink('auramind://app/study')).toBe('/dashboard/study'); // legacy-name: ok
    expect(parseDeepLink('auramind://app/decks')).toBe('/dashboard/decks'); // legacy-name: ok
    expect(parseDeepLink('auramind://app/chat')).toBe('/dashboard/chat'); // legacy-name: ok
    expect(parseDeepLink('auramind://app/settings')).toBe('/dashboard/settings'); // legacy-name: ok
    expect(parseDeepLink('auramind://app/study/some-deck')).toBe('/dashboard/study/some-deck'); // legacy-name: ok
  });

  it('preserves query and hash', () => {
    expect(parseDeepLink('auramind://app/dashboard/study?deck=abc#card-2')).toBe( // legacy-name: ok
      '/dashboard/study?deck=abc#card-2',
    );
  });

  it('accepts bonamind:// exactly like auramind://', () => { // legacy-name: ok
    expect(parseDeepLink('bonamind://app/study')).toBe('/dashboard/study');
    expect(parseDeepLink('bonamind://app/dashboard/study?deck=abc#card-2')).toBe('/dashboard/study?deck=abc#card-2');
  });

  it('keeps the allowlist for the new scheme', () => {
    expect(parseDeepLink('bonamind://app/admin')).toBeNull();
    expect(parseDeepLink('bonamind://app/__e2e/x')).toBeNull();
    expect(parseDeepLink('bonamindx://app/study')).toBeNull();
  });

  it('rejects foreign schemes, unknown paths and the dev harness', () => {
    expect(parseDeepLink('https://bonamind.app/dashboard')).toBeNull();
    expect(parseDeepLink('auramind://app/__e2e/android')).toBeNull(); // legacy-name: ok
    expect(parseDeepLink('auramind://app/admin/backdoor')).toBeNull(); // legacy-name: ok
    expect(parseDeepLink('not a url')).toBeNull();
  });
});

describe('consumePendingRoute', () => {
  const store = new Map<string, string>();
  const native = { value: true };

  beforeEach(() => {
    store.clear();
    native.value = true;
    vi.resetModules();
    vi.doMock('../lib/nativeShim', () => ({
      Capacitor: { isNativePlatform: () => native.value },
      Preferences: {
        get: async ({ key }: { key: string }) => ({ value: store.get(key) ?? null }),
        remove: async ({ key }: { key: string }) => { store.delete(key); },
      },
    }));
  });

  const load = () => import('../lib/deepLinks');

  it('returns the route a native surface left, once', async () => {
    store.set('bonamind_pending_route', '/dashboard/study');
    const { consumePendingRoute } = await load();
    expect(await consumePendingRoute()).toBe('/dashboard/study');
    expect(store.has('bonamind_pending_route')).toBe(false);
    expect(await consumePendingRoute()).toBeNull();
  });

  it('normalizes a bare path and applies the same allowlist as a deep link', async () => {
    store.set('bonamind_pending_route', 'study/deck-1');
    const { consumePendingRoute } = await load();
    expect(await consumePendingRoute()).toBe('/dashboard/study/deck-1');

    store.set('bonamind_pending_route', '/admin/backdoor');
    expect(await consumePendingRoute()).toBeNull();
  });

  it('is null on the web', async () => {
    native.value = false;
    store.set('bonamind_pending_route', '/dashboard/study');
    const { consumePendingRoute } = await load();
    expect(await consumePendingRoute()).toBeNull();
  });
});
