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
      // No longer raised to swallow the on-device AI bundle: see globIgnores.
      // 2 MB is comfortably above the largest chunk that should ever be
      // precached, and it makes a future multi-megabyte asset fail to precache
      // (worse offline) rather than silently inflate every install.
      maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
      globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
      // Precaching is not lazy. Anything matching here is downloaded during
      // install whether or not the user ever reaches the feature, which
      // undoes code splitting for exactly the chunks that are most expensive
      // and least used. Each of these is already split out and loaded on
      // demand; they are cached at runtime instead (see below), so offline
      // still works once the feature has actually been used.
      globIgnores: [
        // 5.9 MB raw / ~2.1 MB gzipped. localInferenceService imports
        // @mlc-ai/web-llm dynamically and only when a user turns on on-device
        // AI. Precaching it charged every PWA installer for an inference
        // engine most of them never enable.
        '**/vendor-webllm-*.js',
        // The phone shells. Unreachable from a browser tab, so a web install
        // was paying for Android and iOS UI it can never render.
        '**/Android*.js',
        '**/IOS*.js',
        // Only loaded when a user imports a PDF.
        '**/vendor-pdfjs-*.js',
      ],
    
      // Cache strategies for different resources
      runtimeCaching: [
        // The chunks excluded from the precache above. Cache-first, so the
        // second visit is instant and the feature works offline, but nothing
        // is paid for until the user actually reaches it.
        {
          urlPattern: /\/vendor-webllm-[\w-]+\.js$/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'on-device-ai',
            expiration: {
              maxEntries: 4,
              maxAgeSeconds: 30 * 24 * 60 * 60,
            },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
        {
          urlPattern: /\/vendor-pdfjs-[\w-]+\.js$/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'pdf-engine',
            expiration: {
              maxEntries: 4,
              maxAgeSeconds: 30 * 24 * 60 * 60,
            },
            cacheableResponse: { statuses: [0, 200] },
          },
        },
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



