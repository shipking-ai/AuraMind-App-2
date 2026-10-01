import { describe, it, expect, vi } from 'vitest';
import { routeDeepLink } from '../desktop/deepLinkRouter';

const deps = () => ({ navigate: vi.fn(), exchangeCode: vi.fn(async () => ({ error: null as unknown })) });

describe('routeDeepLink', () => {
  it('opens allowlisted app routes', async () => {
    const d = deps();
    await expect(routeDeepLink('auramind://app/study', d)).resolves.toBe('navigated');
    expect(d.navigate).toHaveBeenCalledWith('/dashboard/study');
  });

  it('ignores routes outside the allowlist', async () => {
    const d = deps();
    await expect(routeDeepLink('auramind://app/admin/users', d)).resolves.toBe('ignored');
    expect(d.navigate).not.toHaveBeenCalled();
  });

  it('finishes sign-in with the PKCE code', async () => {
    const d = deps();
    await expect(routeDeepLink('auramind://auth/callback?code=abc', d)).resolves.toBe('signed-in');
    expect(d.exchangeCode).toHaveBeenCalledWith('abc');
    expect(d.navigate).toHaveBeenCalledWith('/dashboard');
  });

  it('a failed or refused sign-in returns to the sign-in page', async () => {
    const d = deps();
    d.exchangeCode.mockResolvedValueOnce({ error: new Error('bad verifier') });
    await expect(routeDeepLink('auramind://auth/callback?code=forged', d)).resolves.toBe('sign-in-failed');
    expect(d.navigate).toHaveBeenLastCalledWith('/auth?error=oauth');
    const d2 = deps();
    await expect(routeDeepLink('auramind://auth/callback?error=access_denied', d2)).resolves.toBe('sign-in-failed');
    expect(d2.exchangeCode).not.toHaveBeenCalled();
  });
});
