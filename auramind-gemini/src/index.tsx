import React, { Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './styles/platform-styles.css';
import { Capacitor } from './lib/nativeShim';
// Loads last so the editorial layer can override platform-styles' drifted
// values by cascade order rather than !important.
import './styles/editorial.css';
import './styles/android-native.css';

// Environment validation
import { validateEnv, logEnvValidation } from './lib/env';

// Error handling
import { ErrorBoundary, setupGlobalErrorHandler } from './components/shared/ErrorBoundary';

// SEO
import { updateMetaTags, setDefaultJsonLd } from './lib/seo';

// Crash reporting
import { initSentry } from './services/monitoring/sentryService';

// Offline support
import { isOnline, onConnectionChange, syncOfflineData } from './services/offline/offlineStudyService';
import { getAppPreference } from './lib/appPreferences';

// Data layer
import { QueryClientProvider } from '@tanstack/react-query';
// React Query Devtools — strictly opt-in.
//
// Why so heavily gated:
//   - The floating button sits at bottom-left by default and visually
//     competes with page-level CTAs and section badges (it ate the
//     comparison table's "THIS ONE" pill in early QA passes).
//   - Dev mode isn't enough of a signal: `npm run dev` is used for
//     marketing screenshots, preview links, and demos — none of which
//     should carry a debug surface.
//   - Production builds must NEVER include the devtools (stripped by
//     tree-shaking thanks to the env-conditional import).
//
// To re-enable for cache debugging, add `VITE_RQ_DEVTOOLS=true` to
// `.env.local` and restart the dev server. The button then appears at
// bottom-left, intentionally, so QA notes in screenshots reveal cache
// state — NOT a default.
const ReactQueryDevtools =
  import.meta.env.DEV && import.meta.env.VITE_RQ_DEVTOOLS === 'true'
    ? React.lazy(() =>
        import('@tanstack/react-query-devtools').then((m) => ({ default: m.ReactQueryDevtools })),
      )
    : null;
import { queryClient } from './lib/queryClient';

// Initialize Sentry (no-op if DSN not configured)
initSentry();

// Validate environment at startup
const envResult = validateEnv();
logEnvValidation(envResult);

/**
 * Service worker: web only, and actively removed on native.
 *
 * THE PROBLEM IT CAUSED
 *
 * Capacitor serves the app from https://localhost -- a fixed origin that
 * never changes between releases. Service worker registrations and Cache
 * Storage are keyed to the origin and live in app_webview/Default/, which
 * survives `install -r` and Play updates; only an uninstall or "clear data"
 * removes them.
 *
 * The workbox precache covers index.html and every hashed asset. So after an
 * app update the APK contains new assets, but the still-registered old worker
 * answers the navigation from its own precache and boots the PREVIOUS
 * release's JavaScript. registerType 'autoUpdate' does install the new worker
 * and claim clients, but not before that first page load has already been
 * served from the stale cache -- so every update runs old code for at least
 * one launch, with no refresh button and no address bar for the user to
 * escape with.
 *
 * This was not theoretical: a fix verified as working on device turned out to
 * be running the previous bundle entirely (built index chunk and loaded index
 * chunk had different hashes) until the worker was manually unregistered.
 *
 * WHY REMOVING IT COSTS ALMOST NOTHING HERE
 *
 * A service worker earns its keep on the web by making assets available
 * offline. Inside the APK every asset is already local, so the precache is
 * pure duplication -- it can only ever serve an older copy of a file that is
 * already on disk. The one real loss is runtime caching of Supabase GETs
 * (NetworkFirst, one hour); the app has its own offline layer for study data,
 * and correctness after an update matters more than an hour of response
 * reuse.
 *
 * Unregistering rather than merely skipping registration is deliberate: every
 * install already in the wild has a worker that will otherwise keep serving
 * stale assets forever.
 */
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  if (Capacitor.isNativePlatform()) {
    void navigator.serviceWorker
      .getRegistrations()
      .then(async (registrations) => {
        if (registrations.length === 0) return;
        await Promise.all(registrations.map((registration) => registration.unregister()));
        // The precache outlives the registration, so clear it too.
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
        console.warn('[PWA] Removed service worker on native; assets ship in the APK');
      })
      .catch(() => undefined);
  } else {
    import('virtual:pwa-register').then(({ registerSW }) => {
      registerSW({
        onNeedRefresh() {
          console.warn('[PWA] New content available, need refresh');
        },
        onOfflineReady() {
          console.warn('[PWA] Offline ready');
        },
      });
    }).catch(err => console.error('[PWA] Registration failed', err));
  }
}

// Set up global error handlers
setupGlobalErrorHandler();

// Initialize SEO meta tags
updateMetaTags();
setDefaultJsonLd();

// Connection status monitoring
let isCurrentlyOnline = isOnline();
onConnectionChange(
  () => {
    isCurrentlyOnline = true;
    console.warn('[Network] Connection restored');
    const autoSync = getAppPreference('auramind_autoSync', true);
    if (!autoSync) return;
    syncOfflineData().then(result => {
      if (result.synced > 0) {
        console.warn(`[Sync] Synced offline items (${result.synced} succeeded, ${result.failed} failed)`);
      }
    });
  },
  () => {
    isCurrentlyOnline = false;
    console.warn('[Network] Connection lost - offline mode active');
  }
);

// Expose connection status globally
(window as any).__AURAMIND_ONLINE__ = () => isCurrentlyOnline;

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
        {ReactQueryDevtools && (
          <Suspense fallback={null}>
            <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
          </Suspense>
        )}
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);



