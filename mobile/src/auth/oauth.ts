import * as WebBrowser from 'expo-web-browser';
import { getSupabase } from '../data/supabase';

/** Must be listed in Supabase → Authentication → URL Configuration. */
export const OAUTH_REDIRECT = 'bonamind://auth/callback';

export async function signInWithGoogle(): Promise<{ cancelled: true } | { error: string } | { ok: true }> {
  const supabase = getSupabase();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: OAUTH_REDIRECT, skipBrowserRedirect: true },
  });
  if (error || !data?.url) return { error: error?.message ?? 'no_url' };
  const result = await WebBrowser.openAuthSessionAsync(data.url, OAUTH_REDIRECT);
  if (result.type !== 'success') return { cancelled: true };
  const code = /[?&]code=([^&#]+)/.exec(result.url)?.[1];
  if (!code) return { error: 'no_code' };
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(decodeURIComponent(code));
  return exchangeError ? { error: exchangeError.message } : { ok: true };
}
