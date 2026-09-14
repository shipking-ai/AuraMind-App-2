import { describe, it, expect } from 'vitest';
import { parseDeepLink } from '../lib/deepLinks';

describe('parseDeepLink', () => {
  it('routes launcher shortcuts to their destinations', () => {
    expect(parseDeepLink('auramind://app/dashboard/study')).toBe('/dashboard/study');
    expect(parseDeepLink('auramind://app/generator')).toBe('/dashboard/generator');
    expect(parseDeepLink('auramind://app/dashboard/chat')).toBe('/dashboard/chat');
  });

  it('normalizes bare top-level prefixes that would otherwise 404', () => {
    expect(parseDeepLink('auramind://app/study')).toBe('/dashboard/study');
    expect(parseDeepLink('auramind://app/decks')).toBe('/dashboard/decks');
    expect(parseDeepLink('auramind://app/chat')).toBe('/dashboard/chat');
    expect(parseDeepLink('auramind://app/settings')).toBe('/dashboard/settings');
    expect(parseDeepLink('auramind://app/study/some-deck')).toBe('/dashboard/study/some-deck');
  });

  it('preserves query and hash', () => {
    expect(parseDeepLink('auramind://app/dashboard/study?deck=abc#card-2')).toBe(
      '/dashboard/study?deck=abc#card-2',
    );
  });

  it('rejects foreign schemes, unknown paths and the dev harness', () => {
    expect(parseDeepLink('https://auramind.app/dashboard')).toBeNull();
    expect(parseDeepLink('auramind://app/__e2e/android')).toBeNull();
    expect(parseDeepLink('auramind://app/admin/backdoor')).toBeNull();
    expect(parseDeepLink('not a url')).toBeNull();
  });
});
