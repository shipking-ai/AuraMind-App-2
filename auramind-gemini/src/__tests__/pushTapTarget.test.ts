import { describe, expect, it, vi } from 'vitest';

vi.mock('../lib/nativeShim', () => ({
  Capacitor: { isNativePlatform: () => false },
  LocalNotifications: {},
  PushNotifications: {},
}));
vi.mock('../services/database/supabase', () => ({ supabase: null }));

import { pushTapTarget } from '../services/notifications/pushService';

describe('pushTapTarget', () => {
  // Installed builds from the rename's first release on must follow links in
  // both schemes: the server switches its reminders to bonamind:// later.
  it('follows app links in both schemes', () => {
    expect(pushTapTarget({ link: 'bonamind://app/dashboard' })).toBe('bonamind://app/dashboard');
    expect(pushTapTarget({ link: 'auramind://app/dashboard' })).toBe('auramind://app/dashboard'); // legacy-name: ok
  });

  it('ignores anything that is not an allowed app link', () => {
    expect(pushTapTarget({ link: 'https://evil.example' })).toBeNull();
    expect(pushTapTarget({ link: 'bonamind://app/admin' })).toBeNull();
    expect(pushTapTarget({ link: 'bonamindx://app/dashboard' })).toBeNull();
    expect(pushTapTarget({})).toBeNull();
    expect(pushTapTarget(undefined)).toBeNull();
  });
});
