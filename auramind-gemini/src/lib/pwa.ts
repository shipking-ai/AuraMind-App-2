import { VitePWA } from 'vite-plugin-pwa';

/**
 * PWA Configuration for AuraMind
 * 
 * Enables offline studying, installability, and push notifications.
 * Key features:
 * - Offline flashcard review (cached decks and cards)
 * - Install as native app on mobile/desktop
 * - Background sync for study progress
 * - Push notifications for review reminders
 */
export const pwaConfig = VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['favicons,logos/favicon.ico', 'favicons,logos/apple-touch-icon.png'],
  manifest: {
    name: 'AuraMind - Voice-Powered Flashcards',
    short_name: 'AuraMind',
    description: 'Study hands-free. Aura speaks flashcards aloud, listens to your answers, and turns lectures and docs into decks with FSRS v5.',
    theme_color: '#0a0a0a',
    background_color: '#0a0a0a',
    display: 'standalone',
    orientation: 'any',
    scope: '/',
    start_url: '/',
    icons: [
      {
        src: '/favicons,logos/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/favicons,logos/icon-384.png',
        sizes: '384x384',
        type: 'image/png',
      },
      {
        src: '/favicons,logos/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    categories: ['education', 'productivity'],
    lang: 'en',
    dir: 'ltr',
    prefer_related_applications: false,
    // Windows 11 widget board (Edge): the due count as a pinnable card. The
    // data is owned by the service worker — see public/widget-sw.js. The
    // plugin's manifest type predates the widgets member, which ships to the
    // manifest untouched.
    widgets: [
      {
        name: 'Cards due',
        short_name: 'Due',
        description: 'How many cards are waiting for review, and the deck to start with.',
        tag: 'auramind-due',
        template: 'auramind-due',
        ms_ac_template: '/widgets/due-template.json',
        data: '/widgets/due-data.json',
        type: 'application/json',
        auth: false,
        update: 1800,
        screenshots: [
          {
            src: '/auramind/og-cover.png',
            sizes: '1200x630',
            label: 'The number of cards due for review',
          },
        ],
        icons: [{ src: '/favicons,logos/icon-192.png', sizes: '192x192' }],
      },
    ],
  } as Record<string, unknown>,
  workbox: {
    // Widget-board handlers live beside the generated worker rather than in
    // it, so the generateSW setup stays untouched.
    importScripts: ['/widget-sw.js'],
    maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB (WebLLM bundle is ~8MB)
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
    
    // Cache strategies for different resources
    runtimeCaching: [
      // Supabase API - network first, fallback to cache
      {
        urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'supabase-api-cache',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60, // 1 hour
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      
      // AI API calls - network only (don't cache AI responses)
      {
        urlPattern: /^https:\/\/api\.groq\.com\/.*/i,
        handler: 'NetworkOnly',
      },
      
      // Static assets - cache first
      {
        urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp|ico)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'static-images',
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          },
        },
      },
      
      // Fonts - cache first
      {
        urlPattern: /\.(?:woff|woff2|ttf|eot)$/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'fonts-cache',
          expiration: {
            maxEntries: 20,
            maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
          },
        },
      },
      
      // Google Fonts
      {
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-stylesheets',
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 365 * 24 * 60 * 60,
          },
        },
      },
      {
        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-webfonts',
          expiration: {
            maxEntries: 30,
            maxAgeSeconds: 365 * 24 * 60 * 60,
          },
        },
      },
    ],
  },
  
// Development mode settings
devOptions: {
  enabled: false, // Disable PWA in development to avoid HMR issues
  type: 'module',
},
});



