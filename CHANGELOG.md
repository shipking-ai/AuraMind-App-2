# Changelog

All notable changes to AuraMind will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Admin bulk email** - the endpoint now sends through Resend with
  per-recipient `{sent, failed}` accounting instead of logging and
  reporting a fake success
- **Cookie-consent banner** - one-time, non-blocking; analytics init
  skips until Accept, Decline keeps it off, legacy Settings opt-outs
  are honored silently

### Fixed
- **Review ratings of 5 rejected** - `record_card_review` still capped
  at 0..4 after the table went 0..5; Easy/perfect-recall reviews 22000'd
- **Session replay lost re-graded cards** - `card_reviews` kept one row
  per card, so a later re-grade moved the row out of the earlier
  session's time window; the table now stores one row per review with
  a `(user_id, card_id, reviewed_at)` idempotency key for offline retry
- **Payment-success email showed no billing date** - it read
  `invoice.next_payment_attempt`, null on success; now uses the
  subscription's `current_period_end`
- **Undeclared `zod` dependency** - imported by the API but only present
  via lockfile residue and local hoisting; CI's clean install failed.
  Now declared at the last locked 3.22.4
- **E2E auth tests hung on `networkidle`** - Turnstile holds a
  challenges.cloudflare.com connection open; those tests wait on
  `domcontentloaded` plus locator assertions instead

### Security
- **`fetch-url` / `fetch-youtube-transcript` required no auth** - open
  fetch-and-parse proxy behind only IP rate limiting; both now require
  the session bearer token, which the generator screens send
- **Transcription skipped entitlement** - any signed-in free account
  could spend server Whisper budget; now gated like chat (402)
- **Realtime-notify edge function authenticated** - previously broadcast
  any payload to any user's channel; fail-closed shared secret, and 11
  unused legacy edge functions (open Groq proxy, open email relay,
  hard-coded test secret) deleted

## [2.0.0] - 2026-09-09

First release published to Google Play (closed testing). Android ships from
the same React source via Capacitor 8.

### Added
- **FSRS v5** - replaced SM-2 with the Free Spaced Repetition Scheduler
- **AI provider failover** - Groq -> Cerebras -> Gemini -> OpenRouter, all
  OpenAI-shaped, so a spent free tier degrades to another free tier instead of
  an outage. A 4xx that would fail identically everywhere does not fail over
- **Puter.js fallback** - user-pays in-browser AI offered when every server
  provider is rate limited
- **AI fact-checking**, **Anki export**, **offline study** (IndexedDB with a
  sync queue), **PWA install**, **data export**, **cookie consent**
- **Cloudflare Turnstile** on captcha-gated Supabase auth calls
- **Android home-screen widget** - 2x2 RemoteViews showing cards due, fed by
  the web layer through Capacitor Preferences so FSRS stays in one place
- **Editorial design system for Android** - a token layer over the platform
  styles: a real mobile type scale, three radii, one hairline, and a full-bleed
  hero. Replaces a look assembled from ad-hoc values
- **Haptics on the study loop** - the card flip and session completion, which
  had none, alongside the existing rating feedback
- **Press feedback** - controls dip on touch, behind prefers-reduced-motion
- **3D card flip** - a shell rotates the card while the tilt continues
  underneath, replacing a crossfade
- **SEO** - Open Graph, Twitter Cards and JSON-LD structured data
- **Loading skeletons** and a custom 404 page
- **Environment validation** - fail fast on missing required variables
- **Security headers** - CSP, HSTS, X-Frame-Options

### Changed
- **Entitlement moved to `app_metadata`** - see Security
- **Reminders sync at app start**, not only while the Settings screen is open,
  so a schedule can be repaired without visiting Settings
- **Service worker no longer runs on native** - see Fixed
- **Streak derived from `study_sessions`** rather than a profile column
- **Android release pipeline** - versionCode from CI run number, closed-track
  uploads, and a release status input (draft until the first publish)
- Socratic tutoring - Prof. Aura guides toward an answer rather than stating it
- Header avatar shows the account picture rather than initials
- The signed-in email is masked in Settings, revealed on tap

### Fixed
- **Rate limiting never applied.** `applyMiddleware` was called without
  `await`, so every request proceeded before the limiter resolved
- **Daily reminders fired once and never again.** Capacitor treats an `on`
  pattern as one-shot unless `repeats` is set; the OS held every reminder with
  `repeats: false`
- **Service worker served the previous release's JavaScript.** Capacitor's
  origin never changes, so a registered worker survives app updates and
  answered navigations from its own precache. Assets already ship in the APK,
  so the precache could only ever serve an older copy of a local file
- **Two loading screens on launch** - the splash now holds until the app can
  render instead of handing off to a second, differently-styled loader
- **Android AI calls resolved against the device** rather than the API host
- **`card_analytics` leaked every user's cards** - the view ran as its owner
- Chat header overflowed the viewport on 412px phones; section headings
  collided with their subtitles; tap targets below 40px
- CSP blocked the Google Fonts stylesheet and the PostHog scripts

### Security
- **Paywall bypass.** `subscription_status` lived in `user_metadata`, which a
  signed-in user can write directly, so any account could grant itself a
  permanent subscription. Entitlement now reads `app_metadata`, writable only
  with the service-role key, with no fallback
- **Client bundle published every `VITE_` variable.** A dynamic
  `import.meta.env[name]` lookup defeats Vite's per-variable substitution and
  inlines the whole env object. Reads now go through a static allowlist
- `anon` could execute all 18 SECURITY DEFINER functions over PostgREST
- `search_path` pinned on public functions
- Turnstile added to auth


## [1.0.0] - 2026-01-15

### Added
- Initial release of AuraMind
- AI-powered flashcard generation (Groq, OpenRouter, Local AI)
- Spaced repetition with SM-2 algorithm
- Study modes: Flashcard review, Quiz, Study Buddy chat
- Supabase authentication and database
- Stripe subscription management
- Dashboard with analytics and progress tracking
- Import from Anki, Notion, Obsidian, PDF, PPTX
- Responsive design for desktop and mobile
- Dark/light theme support
- Gamification with streaks and achievements
- PostHog analytics integration
