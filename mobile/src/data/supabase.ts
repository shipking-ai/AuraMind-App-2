import 'react-native-url-polyfill/auto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { env } from '../env';
import { chunkedSecureStorage } from './secureStorage';

let client: SupabaseClient | null = null;

/**
 * The app's one Supabase client. The session lives in secure storage and
 * refreshes only while the app is in the foreground. A build without a
 * configured project still boots (to its sign-in screen) on a placeholder.
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;
  const c = createClient(env.supabaseUrl || 'https://placeholder.supabase.co', env.supabaseAnonKey || 'placeholder', {
    auth: {
      storage: chunkedSecureStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      // OAuth returns ?code= to bonamind://auth/callback (the implicit flow's
      // #access_token fragment can't be exchanged by the app).
      flowType: 'pkce',
    },
  });
  AppState.addEventListener('change', (state) => {
    if (state === 'active') c.auth.startAutoRefresh();
    else c.auth.stopAutoRefresh();
  });
  client = c;
  return c;
}
