/**
 * Client configuration. Expo inlines EXPO_PUBLIC_* only for static property
 * reads (`process.env.EXPO_PUBLIC_X`); a computed-key lookup would
 * not be inlined. Same rule as the website's CLIENT_ENV allowlist: every
 * value here is public by design, and no server secret may ever be added.
 */
export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  // The host that serves the API, not one that redirects to it: a cross-host
  // redirect drops the Authorization header, and Linnea then never answers.
  // (Vercel 308s bonamind.app -> www.bonamind.app as of 2026-10-11.)
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || 'https://www.bonamind.app',
  turnstileSiteKey: process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY ?? '',
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN || undefined,
  appleSignIn: process.env.EXPO_PUBLIC_APPLE_SIGN_IN === 'true',
  e2e: process.env.EXPO_PUBLIC_E2E === 'true',
} as const;
