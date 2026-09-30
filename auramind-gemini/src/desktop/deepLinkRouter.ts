/**
 * auramind:// links in the Windows app. App links go through the same
 * allowlist as the phone apps. The auth callback finishes PKCE sign-in: the
 * verifier never left this origin, so a forged code can't sign anyone in.
 */
import { parseDeepLink } from '../lib/deepLinks';

export async function routeDeepLink(
  url: string,
  deps: { navigate: (path: string) => void; exchangeCode: (code: string) => Promise<{ error: unknown }> },
): Promise<'navigated' | 'signed-in' | 'sign-in-failed' | 'ignored'> {
  if (url.startsWith('auramind://auth/callback')) {
    const params = new URL(url).searchParams;
    const code = params.get('code');
    if (!code || params.get('error')) {
      deps.navigate('/auth?error=oauth');
      return 'sign-in-failed';
    }
    const { error } = await deps.exchangeCode(code);
    if (error) {
      deps.navigate('/auth?error=oauth');
      return 'sign-in-failed';
    }
    deps.navigate('/dashboard');
    return 'signed-in';
  }
  const path = parseDeepLink(url);
  if (!path) return 'ignored';
  deps.navigate(path);
  return 'navigated';
}
