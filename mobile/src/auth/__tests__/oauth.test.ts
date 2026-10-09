import * as WebBrowser from 'expo-web-browser';
import { getSupabase } from '../../data/supabase';
import { OAUTH_REDIRECT, signInWithGoogle } from '../oauth';

jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('../../data/supabase', () => {
  const auth = {
    signInWithOAuth: jest.fn(async () => ({ data: { url: 'https://auth.example/authorize' }, error: null })),
    exchangeCodeForSession: jest.fn(async () => ({ data: {}, error: null })),
  };
  return { getSupabase: () => ({ auth }) };
});
const auth = getSupabase().auth as unknown as { signInWithOAuth: jest.Mock; exchangeCodeForSession: jest.Mock };

beforeEach(() => jest.clearAllMocks());

it('asks Supabase for a Google URL that returns to the app', async () => {
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'success', url: `${OAUTH_REDIRECT}?code=abc` });
  await signInWithGoogle();
  expect(OAUTH_REDIRECT).toBe('bonamind://auth/callback');
  expect(auth.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: OAUTH_REDIRECT, skipBrowserRedirect: true } });
  expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith('https://auth.example/authorize', OAUTH_REDIRECT);
  expect(auth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
});

it('does nothing when the user cancels', async () => {
  (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({ type: 'cancel' });
  expect(await signInWithGoogle()).toEqual({ cancelled: true });
  expect(auth.exchangeCodeForSession).not.toHaveBeenCalled();
});
