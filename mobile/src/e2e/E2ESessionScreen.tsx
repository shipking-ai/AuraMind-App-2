import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { getSupabase } from '../data/supabase';
import { env } from '../env';

/**
 * End-to-end builds only (EXPO_PUBLIC_E2E=true): CI mints a session for the
 * test account server-side and opens bonamind://e2e/session?rt=…, so Maestro
 * never has to pass the human check. In every other build this route is
 * inert and redirects home.
 */
export function E2ESessionScreen() {
  if (!env.e2e) return <Redirect href="/" />;
  return <Adopt />;
}

function Adopt() {
  const { rt } = useLocalSearchParams<{ rt?: string }>();
  useEffect(() => {
    if (!rt) return;
    void getSupabase().auth.refreshSession({ refresh_token: rt }).then(() => router.replace('/today'));
  }, [rt]);
  return <View />;
}
