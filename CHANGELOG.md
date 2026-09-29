# Changelog

All notable changes to AuraMind will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Windows app** - a new Tauri 2 desktop app around the bundled web build:
  its own window that remembers its size, one instance at a time, outside
  links (including checkout) opening in the browser, and signed auto-updates
  from GitHub Releases with an in-app "Restart and update" prompt. Replaces
  the retired June desktop build
- **Classroom portal** - teachers create classes, students join with a
  6-character code or deep link, and teachers assign decks and
  multiple-choice quizzes graded on the server, with per-student progress
  and most-missed terms. Every write goes through a SECURITY DEFINER RPC
- **Memory sparks** - cards that are fading (not yet forgotten) resurface
  as in-app pop-ups, native notifications, and cards mixed into study
  sessions, all driven by one FSRS-based scheduler
- **Onboarding flow** - role and topic, with a starter deck created before
  the paywall so the library is never empty
- **Tester role** - an internal QA role that skips the paywall with no
  staff powers
- **Unified admin hub** - every `/admin/*` page in the dashboard shell, a new
  Overview and Settings page, a working notification panel, and review
  charts built from real `card_reviews` history
- **Push sender** - FCM HTTP v1 sender, admin `POST /api/push/send`, and a
  daily due-card reminder; dormant until Firebase credentials are set
- **Voice on Android** - read-aloud and spoken-answer listening through
  native plugins (the WebView has no Web Speech API), spoken reminders,
  and natural AI voices with the device voice as fallback
- **iOS app** - Capacitor 8 project built unsigned in CI, with an
  iOS-native design, Prof. Aura chat (Talk / Notebook / Cards), the study
  session as a Live Activity, and Siri / Shortcuts ("quiz me", "what's
  due"). A public sample-data preview builds with `npm run build:ios-preview`
- **Android 16 Live Update** for study sessions, plus launcher shortcuts,
  a Quick Settings tile, deck pinning, and a Material shell
- **Desktop web extras** - Study Float (an always-on-top review window),
  a Windows 11 widget board widget, and on-device key-idea / translation
  with Chrome's built-in AI
- **Scroll-reactive aurora** - depth parallax and hue drift on the
  dashboard, landing hero, and Android aura; off under reduced motion
- **"Accept only necessary"** option on the cookie banner
- **Admin bulk email** - the endpoint now sends through Resend with
  per-recipient `{sent, failed}` accounting instead of logging and
  reporting a fake success
- **Cookie-consent banner** - one-time, non-blocking; analytics init
  skips until Accept, Decline keeps it off, legacy Settings opt-outs
  are honored silently

### Changed
- **Scheduler is now the official `ts-fsrs` (FSRS-6)** - see Fixed.
  Per-user FSRS tuning is ignored until it is rebuilt for FSRS-6
- **CI runs on Node 22 and 24**; Node 20 (end of life) was dropped
- Reminders sync at app start as well as from Settings
- Turnstile is disabled and OAuth buttons hidden inside the native apps
- Unused files, routes and dependencies removed, including the legacy
  unentitled chat endpoint and the learning-paths feature

### Fixed
- **FSRS intervals were ~140x too long** - the hand-written scheduler
  mis-mapped grades, so "Hard" could schedule a card 100 years out. Replaced
  with `ts-fsrs`; a migration reset the schedules it had written
- **Weekly league XP double-counted** - now added once, written only through
  the `increment_weekly_xp` RPC
- **Memory sparks** ignored the global gap between sparks, and re-plans
  used up the daily cap
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
- **Admin oracle closed** - any signed-in user could call `is_admin(uuid)` /
  `is_super_admin(uuid)` to learn whether an account was an admin. Client
  EXECUTE revoked; the `audit_events` policy uses `current_user_is_admin()`
- **Client role came from `user_metadata`** - one `auth.updateUser` call
  could set `role: 'admin'` and unlock the paywall in the UI. Roles now come
  from `app_metadata` only, on client and server alike
- **Metadata wiped on billing events** - `updateUserById` replaces
  `app_metadata` wholesale, so a purchase or dunning event could demote
  staff. Every call site now merges the existing metadata
- **Classroom writes are RPC-only**, and a student can no longer copy
  another user's private deck through an assignment
- **Production dependency audit is clean** in the app, API, and root
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
