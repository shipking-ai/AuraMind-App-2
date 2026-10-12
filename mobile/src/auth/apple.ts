import * as AppleAuthentication from 'expo-apple-authentication';
import { getSupabase } from '../data/supabase';

/** Only offered when EXPO_PUBLIC_APPLE_SIGN_IN is on (needs the paid Apple program). */
export async function signInWithApple(): Promise<{ cancelled: true } | { error: string } | { ok: true }> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) return { error: 'no_token' };
    const { error } = await getSupabase().auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken });
    return error ? { error: error.message } : { ok: true };
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return { cancelled: true };
    return { error: (e as Error).message };
  }
}
