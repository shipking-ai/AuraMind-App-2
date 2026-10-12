import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { getSupabase } from '../../data/supabase';

/**
 * bonamind://auth/callback?code=… — on Android the OAuth redirect can arrive
 * here as a deep link rather than through the auth session. Exchange the
 * code (harmless if the auth session already did) and go home.
 */
export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const [done, setDone] = useState(!code);
  useEffect(() => {
    if (!code) return;
    getSupabase().auth.exchangeCodeForSession(code).finally(() => setDone(true));
  }, [code]);
  return done ? <Redirect href="/" /> : <View />;
}
