import type { ExpoConfig } from 'expo/config';

/**
 * Store identifiers are permanent per store:
 * - iOS was never published under the old name, so it starts as BonaMind.
 * - Android keeps the package Google Play already keys the listing,
 *   testers and closed-testing history to. The new app installs over the
 *   Capacitor build as an update (same upload key, higher versionCode).
 */
// Expo's config loader cannot import TypeScript from @bonamind/core, so the
// name is inlined here; appConfig.test.ts asserts it equals core's APP_NAME.
export const APP_NAME = 'BonaMind';

const IOS_BUNDLE_ID = 'com.bonamind.app';
const ANDROID_PACKAGE = 'com.auramind.app';

// Sign in with Apple needs the paid Apple Developer Program; its entitlement
// would also break free-account sideloading, so it is opt-in per build.
const appleSignIn = process.env.EXPO_PUBLIC_APPLE_SIGN_IN === 'true';

const NIGHT = '#0A0A0F';

const config: ExpoConfig = {
  name: APP_NAME,
  slug: 'bonamind',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/bonamind-icon.png',
  scheme: 'bonamind',
  userInterfaceStyle: 'dark',
  backgroundColor: NIGHT,
  ios: {
    bundleIdentifier: IOS_BUNDLE_ID,
    supportsTablet: false,
    usesAppleSignIn: appleSignIn,
  },
  android: {
    package: ANDROID_PACKAGE,
    versionCode: Number(process.env.ANDROID_VERSION_CODE ?? 1),
    adaptiveIcon: { foregroundImage: './assets/images/bonamind-icon.png', backgroundColor: NIGHT },
    predictiveBackGestureEnabled: true,
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-secure-store',
    'expo-sqlite',
    'expo-web-browser',
    ['expo-splash-screen', { backgroundColor: NIGHT, image: './assets/images/bonamind-icon.png', imageWidth: 96 }],
    ...(appleSignIn ? ['expo-apple-authentication'] : []),
  ],
  experiments: { typedRoutes: true, reactCompiler: true },
};

export default config;
