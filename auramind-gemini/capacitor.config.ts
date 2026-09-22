import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor configuration for the AuraMind Android and iOS apps.
 *
 * - appId is fixed forever: `com.auramind.app`. Changing it after the first
 *   Play Store upload makes the store treat the app as a brand-new package.
 * - webDir points at the Vite production build output (`npm run build`).
 * - Traffic is HTTPS-only via the `https` androidScheme; cleartext is NOT
 *   enabled so release builds reject plain HTTP.
 */
const config: CapacitorConfig = {
  appId: 'com.auramind.app',
  appName: 'AuraMind',
  webDir: 'dist',
  backgroundColor: '#0a0a0a',
  server: {
    androidScheme: 'https',
    cleartext: false,
  },
  ios: {
    // The web layer draws under the status bar and home indicator and pads
    // with env(safe-area-inset-*), same as edge-to-edge Android.
    contentInset: 'never',
    backgroundColor: '#0a0a0a',
  },
  plugins: {
    SplashScreen: {
      // The app hides this itself once auth has resolved (see App.tsx). With
      // autoHide the splash vanished at a fixed 1.2s and the in-app
      // LoadingOverlay took over, so launch showed two different loading
      // screens back to back. Holding the splash until the app is genuinely
      // ready collapses that into one.
      launchShowDuration: 3000,
      launchAutoHide: false,
      backgroundColor: '#0a0a0a',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0a0a',
      overlaysWebView: true,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    App: {
      launchAutoHide: true,
    },
  },
};

export default config;
