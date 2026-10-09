import { InstrumentSerif_400Regular } from '@expo-google-fonts/instrument-serif/400Regular';
import { InstrumentSerif_400Regular_Italic } from '@expo-google-fonts/instrument-serif/400Regular_Italic';
import * as Sentry from '@sentry/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DarkTheme, SplashScreen, Stack, ThemeProvider } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import { initAppData } from '../data/app';
import { useAuth } from '../data/auth';
import { useSync } from '../data/sync';
import { AuroraScreen } from '../design/components/AuroraBackground';
import { OfflinePill } from '../design/components/OfflinePill';
import { colors } from '../design/tokens';
import { env } from '../env';

if (env.sentryDsn) {
  Sentry.init({
    dsn: env.sentryDsn,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.user) delete event.user.email;
      if (event.request) delete event.request.data;
      return event;
    },
  });
}

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } });

// Navigators paint nothing, so the aurora shows through every screen.
const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: 'transparent', card: 'transparent', primary: colors.violetSoft, text: colors.text },
};

function Offline({ userId }: { userId: string | null }) {
  const { online } = useSync(userId);
  return (
    <SafeAreaView pointerEvents="none" style={styles.pill} edges={['top']}>
      <OfflinePill visible={!online} />
    </SafeAreaView>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    BonaSans: require('../../assets/fonts/BonaSans-Regular.ttf'),
    'BonaSans-Bold': require('../../assets/fonts/BonaSans-Bold.ttf'),
    'BonaSans-Italic': require('../../assets/fonts/BonaSans-Italic.ttf'),
    BonaScript: require('../../assets/fonts/BonaScript-Regular.ttf'),
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
  });
  const [dataReady, setDataReady] = useState(false);
  const auth = useAuth();
  const ready = fontsLoaded && dataReady && auth.status !== 'loading';

  useEffect(() => {
    initAppData().then(() => setDataReady(true), (e) => { Sentry.captureException(e); setDataReady(true); });
  }, []);
  useEffect(() => { if (ready) void SplashScreen.hideAsync(); }, [ready]);

  if (!ready) return null;
  const signedIn = auth.status === 'signed-in';
  return (
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider value={theme}>
          <AuroraScreen>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: 'transparent' } }}>
              <Stack.Protected guard={signedIn}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="study/[deckId]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
                <Stack.Screen
                  name="linnea"
                  options={{ presentation: 'formSheet', sheetAllowedDetents: [0.5, 1], sheetGrabberVisible: true, contentStyle: { backgroundColor: 'transparent' } }}
                />
              </Stack.Protected>
              <Stack.Protected guard={!signedIn}>
                <Stack.Screen name="welcome" />
              </Stack.Protected>
            </Stack>
            <Offline userId={auth.userId} />
          </AuroraScreen>
        </ThemeProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.night },
  pill: { position: 'absolute', top: 4, left: 0, right: 0 },
});

