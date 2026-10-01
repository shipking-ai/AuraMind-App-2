# AuraMind Architecture & Reference

> Consolidated from the planning documents on 2026-07-08; re-verified against the code and the live database on 2026-09-28. Refer to `README.md` for setup, `CHANGELOG.md` for version history, `DEPLOYMENT.md` for deployment, and `HANDOFF.md` for current state and traps.

---

## System Overview

AuraMind is a full-stack adaptive AI learning system — it turns any input (PDF, video, lecture, topic) into a personalized course, schedules review with FSRS (the official `ts-fsrs`, FSRS-6), and tutors with a knowledge model of the user's actual weaknesses. Deployable units:

| Unit | Path | Tech | Purpose |
|---|---|---|---|
| Web SPA | `auramind-gemini/` | React 19 + Vite 8 + Tailwind 4 | Main application (PWA) |
| Android app | `auramind-gemini/android/` | Capacitor 8 | Active native build (Play closed testing) |
| iOS app | `auramind-gemini/ios/` | Capacitor 8 (Swift Package Manager) | Built unsigned in CI; not yet on TestFlight |
| Windows app | `auramind-gemini/src-tauri/` | Tauri 2 (WebView2) | Desktop app with signed auto-updates; built in CI, not yet released |
| Backend API | `api/` | Vercel Serverless + Express dev server | Auth, AI proxy, Stripe, admin, push, cron |

**Key dependencies:** Supabase (auth + DB), Stripe (payments), Resend (email), PostHog (analytics), Upstash Redis (distributed rate limiting), Firebase Cloud Messaging (push, dormant until credentials are set). AI providers: Groq, Cerebras, Gemini, OpenRouter (server-side failover), plus Puter (user-pays) and local Ollama/LM Studio.

---

## Database Schema (Supabase PostgreSQL)

The migrations in `supabase/migrations/` are the source of truth; this is a
map, not a column reference. Check columns against
`information_schema.columns` before writing SQL — PL/pgSQL function bodies
don't validate column names until they run.

### Tables the app uses
- **Study core** — `decks`, `cards` (FSRS state as JSONB in `cards.fsrs_state`), `card_reviews` (one row per review, idempotency key `(user_id, card_id, reviewed_at)`), `study_sessions` (also the streak source), `user_fsrs_params`
- **Users** — `user_profiles` (`role` synced from `app_metadata` by `sync_auth_role_to_profiles`), `push_tokens`
- **Classroom portal** — `classrooms`, `classroom_memberships`, `assignments`, `assignment_progress` (client read-only; every write goes through a SECURITY DEFINER RPC)
- **Leagues** — `league_seasons`, `league_memberships` (XP written only by `increment_weekly_xp`)
- **Ops** — `audit_events`, `chat_logs` (AI usage), `processed_webhook_events` (Stripe idempotency), `schema_migrations`

The live project also holds legacy tables that predate the migrations
(`profiles`, `subscriptions`, `stripe_*`, `learning_paths`, …). The app does
not read them; see `SECURITY.md` → *Known drift*.

All tables have Row Level Security enabled; users can only access their own
data unless a policy says otherwise (class members, for example, can read
their own class's roster).

---

## Role-Based Permission System

| Permission | Owner | CEO | Admin | Employee | Tester | User |
|---|---|---|---|---|---|---|
| Access Admin Panel | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Manage Users | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Manage Roles | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| View Analytics | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ |
| Manage Coupons | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Manage Settings | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Delete Users | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Free Access | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |

Derived from the role hierarchy in `utils/permissions.ts` (owner 100, CEO 90,
admin 80, employee 50, tester 30, user 10). Tester is an internal QA role:
it skips the paywall and has no staff powers. Free access must match
`FREE_ACCESS_ROLES` in `api/_lib/entitlement.ts`; `permissions.test.ts`
fails if they drift.

Role is read from `app_metadata.role` only — via `resolveAuthorizationRole()` on the client and `isEntitledWithRoleAccess()` in `api/_lib/entitlement.ts` on the server — and synced into `user_profiles.role` by `sync_auth_role_to_profiles`. `user_metadata` is attacker-writable and is **not** trusted for authorization; `user_metadata.role` is only a display persona. The owner email is configured via `VITE_OWNER_EMAIL`. Roles with free access skip subscription checks on both client and server.

---

## AI Integration

### Provider chain

Client AI never holds a provider key. Requests go to `/api/ai`, which fails
over server-side across every provider that has a key configured:

1. **Groq** — `openai/gpt-oss-120b` (default; fastest)
2. **Cerebras** — `llama-3.3-70b`
3. **Gemini** — `gemini-2.0-flash`, via Google's OpenAI-compatible endpoint
4. **OpenRouter** — `meta-llama/llama-3.3-70b-instruct:free`; broadest choice, easiest to swap

All four speak the OpenAI chat-completions shape, so there is one request
path and no per-provider adapter. A provider with no key is skipped; on
429 / 401 / 403 / 5xx the next one takes over. The response carries
`x-ai-provider` naming whichever one answered. Model IDs are overridable per
provider (`GROQ_MODEL`, `CEREBRAS_MODEL`, …) so a renamed model is a config
change, not a deploy.

When all of them return 429, the client offers **Puter** — a user-pays
fallback that bills the user's own account, so it costs the developer
nothing. Puter's sign-in is a popup and needs a real user gesture, so it is
surfaced as a banner rather than an automatic retry. Last resort after that
is deterministic offline template generation.

**Local AI** (LM Studio / Ollama on port 1234, proxied via Vite at
`/local-ai`) is a separate opt-in path enabled with `VITE_USE_LOCAL_AI=true`.

Audio transcription (`/api/ai/transcribe`, Groq Whisper) and AI voices
(`/api/ai/speech`, Groq Orpheus) go to Groq specifically and do not
participate in the failover chain. Both are entitlement-gated like chat; when
speech is unavailable the client falls back to the device voice.

### Key AI services
- `api/_providers.ts` — provider registry + failover policy
- `api/_aiHandler.ts` — the proxy: auth, allowlisting, failover, usage logging
- `groqClient.ts` — client entry point; talks to `/api/ai`, Puter rescue on 429
- `auraAiService.ts` — multi-provider unified chat
- `puterProvider.ts` — user-pays Puter fallback (SDK loaded from its CDN)
- `templateDeckGenerator.ts` — deterministic offline generation

> `model-service/` (Python FastAPI) is gitignored and local-only — it is not
> part of a fresh clone or the deployed app.

### Chat streaming flow
Client → `POST /api/ai/chat/stream` (Supabase bearer token) → `_aiHandler.ts`
(auth + entitlement) → the same provider failover chain → OpenAI-style SSE
deltas relayed token-by-token to the client. Non-streaming calls use
`/api/ai/chat`. Rate limited at 30 req/min (the `ai` bucket); usage logged to
`chat_logs`.

---

## Spaced Repetition

### FSRS-6 (`src/services/study/fsrs.ts`)
- The math is the official `ts-fsrs` (FSRS-6) in long-term mode: intervals are
  whole days (matching the `cards.interval` INTEGER column), and "Again"
  brings a card back the next day
- State stored as JSONB in `cards.fsrs_state`; SM-2 cards are converted on
  their first review
- `srs.ts` (`calculateSRS`) is the entry point every review path calls; it
  delegates to `scheduleFSRS`
- Replaced an earlier hand-written FSRS whose intervals ran ~140x too long;
  `20260922000000_fsrs_scheduler_repair.sql` reset the cards it had written
- Per-user tuning (`fsrsAdaptation.ts`) still produces a vector for the old
  model, so `scheduleFSRS` ignores it until the tuner is rebuilt on the
  FSRS-6 optimizer (see `HANDOFF.md`)

### Memory sparks (`src/services/memory/`)
Cards in the retrievability band ~0.65–0.90 (fading, not forgotten) resurface
as in-app pop-ups, native notifications, and interleaved cards in study
sessions. One pure scheduler (`sparkScheduler.ts`) drives all three.

---

## API Endpoints

All under `/api` — routed from `api/index.ts` (the Express dev server in
`api/server.js` mounts the same handlers):

| Endpoint | Actions | Auth |
|---|---|---|
| `/api/ai` | chat, chat/stream, transcribe, speech | User JWT + entitlement |
| `/api/admin` | list, toggle, utility, test, health, query, revenue, bulk, audit, set_role, set_subscription, create_test_user, get_user_details, delete_user | Admin JWT |
| `/api/coupons` | list, create, delete | Admin JWT |
| `/api/audit` | list, create | Admin JWT |
| `/api/push` | send | Admin JWT |
| `/api/subscription` | verify (self only) | User JWT |
| `/api/stripe` | checkout, portal | User JWT |
| `/api/stripe-webhook` | Stripe events | Stripe signature |
| `/api/account` | delete | User JWT |
| `/api/email` | transactional email | User JWT |
| `/api/search` | Google Programmable Search | User JWT |
| `/api/integrations` | notion, anki, obsidian, schoology connect/disconnect | User JWT |
| `/api/fetch-url`, `/api/fetch-youtube-transcript` | fetch and parse a source | User JWT |
| `/api/cron` | dunning (also sends daily due-card pushes) | `CRON_SECRET` |

Admin API includes: user role management, test user creation, SQL query
explorer (read-only), bulk operations, CSV export, Stripe revenue metrics.

---

## Frontend Architecture

### Route structure (`App.tsx`)
- **Public**: `/` (landing), `/auth`, `/subscribe`, `/onboarding`, `/docs`, `/privacy`, `/terms`, `/download`, `/about`, `/status`, `/reset-password`, `/restore-account`, `/auth/callback`, `/auth/schoology/callback`
- **Protected**: `/dashboard/*`, `/deck/:id`, `/admin` (overview), `/admin/users`, `/admin/check`, `/admin/settings`
- **Dev/preview only**: `/__e2e/android`, `/__preview/ios/*` (redirects to `/` unless `VITE_IOS_PREVIEW` is set)

`/dashboard/*` renders `NovaHub` inside `NovaDashboardShell`: `/` (overview),
`/decks`, `/study`, `/study/:deckId`, `/spark/:cardId`, `/chat`,
`/generator`, `/study-tools`, `/classes`, `/classes/:id`, `/settings`,
`/settings/all`. Every `/admin/*` path renders in the same shell via
`pages/admin/AdminHub.tsx`.

### Source layout
```
src/
├── pages/          — admin, auth, classroom, dashboard (NovaHub), deck, generator,
│                     legal, onboarding, settings, study, system
├── components/
│   ├── dashboard/nova/  — NovaDashboardShell, NovaOverview, NovaLibrary, NovaStudy, NotificationPanel
│   ├── native/          — Android screens and shell (AndroidMobileScreens, AndroidAura)
│   ├── ios/             — iOS screens and the design preview tour
│   ├── classroom/, memory/, study/, quiz/, chat/, generator/, settings/
│   ├── landing/         — ModernLandingPage
│   └── shared/, ui/, icons/, brand/, graphics/, notifications/, achievements/, gamification/, wear/, float/
├── services/       — api (AI clients), study (FSRS), memory (sparks), classroom,
│                     voice, offline, notifications, database, decks
├── lib/            — pure logic: env allowlist, deep links, platform gates, back stack
└── contexts/       — LayoutContext, DashboardWorkspaceContext
```

### State management
- React Contexts: `LayoutContext`, `DashboardWorkspaceContext`
- Zustand store in `src/lib/auramind/store.ts` (only `cmdOpen` powers the command palette)
- Main app state in `App.tsx` via `useState` + Supabase auth listener

---

## Integrations

- **Notion** — OAuth connect/disconnect
- **Anki** — .apkg import/export
- **Obsidian** — vault path import
- **Quizlet** — username-based connection
- **Schoology** — LMS OAuth (consumer key + access token)
- **Google Search** — Programmable Search via `/api/search`, for grounded answers

---

## Native Apps

- **Android** — active Capacitor 8 app at `auramind-gemini/android/`, built
  from the same React source with a native bottom nav, status-bar/back
  handling, haptics, local reminders, and system sharing.
- **iOS** — Capacitor 8 app at `auramind-gemini/ios/`. The `Mobile iOS`
  workflow builds it unsigned, runs it in a simulator, and checks the Live
  Activity. Both apps share the phone layout; `src/lib/platform.ts` gates the
  Android-only parts. Listening uses a native `AuraListenPlugin` on both
  platforms, because neither WebView's speech recognition works.

### Android platform integrations

| Capability | Where |
|---|---|
| Launcher shortcuts: 3 static + the 2 most recently studied decks | `res/xml/shortcuts.xml`, `AuraDevicePlugin.setRecentDecks` |
| Pin a deck to the home screen | `AuraDevicePlugin.pinDeck` (deck action sheet) |
| Quick Settings tile with the due count | `QuickReviewTileService.java` |
| Screen kept on during a study session | `AuraDevicePlugin.setKeepAwake`, driven by `NativeRuntime` |
| Material You colour, biometric lock, in-app review/updates | `ThemeColorsPlugin`, `BiometricAuthPlugin`, `PlayEngagementPlugin` |
| Share target, home-screen widget, Wear OS sync | `ShareTargetPlugin`, `AuraMindWidgetProvider`, `WearSync*` |

All shortcuts, the tile and the widget open `auramind://app/...` VIEW
intents, so every entry point goes through one allowlist (`lib/deepLinks.ts`).
The tile and widget read the same `CapacitorStorage` due count; neither
reimplements FSRS in Java.

The shell itself (`styles/android-native.css`) adds what a WebView lacks by
default: a top bar that elevates on scroll, a bottom nav that hides while
reading down and returns on reverse, swipe-to-refresh on the list screens
(`lib/workspaceRefresh.ts`), modal bottom sheets that close on the system back
gesture (`lib/backStack.ts`), long-press deck actions, and a navigation rail
at 600dp and up.
- **Windows** — Tauri 2 app at `auramind-gemini/src-tauri/`, a fresh shell
  (the June 2026 Tauri build was retired, not revived). It bundles
  `vite build --mode desktop` and serves it from `https://tauri.localhost`;
  that origin holds every user's session and offline data, so it must never
  change. The web code tells it apart with `isDesktopApp()`; it renders the
  desktop layout, so `appPlatform()` still reports `"web"`.

  | Concern | Where |
  |---|---|
  | Outside links → the user's browser | `stays_in_app()` in `src-tauri/src/guard.rs` (navigations, e.g. checkout); `lib/desktopLinks.ts` (`window.open`, `target=_blank`) |
  | No service worker or Turnstile; OAuth only behind `VITE_DESKTOP_OAUTH` | `isAppShell()` in `lib/platform.ts`, shared with the phone apps; the Windows exception is in `components/auth/AuthPage.tsx` |
  | Subscription re-check after checkout | `hooks/useWindowFocusRefresh.ts` |
  | Signed auto-updates | updater plugin + `lib/desktopUpdater.ts`, `components/desktop/DesktopUpdateBanner.tsx`, About page |
  | API access | `https://tauri.localhost` in `CORS_ORIGINS` (`api/_middleware.ts`) |
  | Tray, taskbar badge, notifications, start with Windows | `src-tauri/src/{tray,badge,nudges}.rs`; due state from `desktop/dueState.ts`, schedule from `desktop/nudgePlanner.ts` |
  | Quick Review window | `src-tauri/src/quick_review.rs` + `pages/quickReview/QuickReviewPage.tsx` (same bundle, `/quick-review`) |
  | Drop to create | `components/shared/DropOverlay.tsx`; Explorer/tray via `src-tauri/src/handoff.rs` and `windows/installer-hooks.nsh` |
  | Links and sign-in | `src-tauri/src/links.rs` → `desktop/deepLinkRouter.ts`; PKCE only in the Windows build |
  | React ↔ Rust contract | `desktop/bridge.ts` ↔ `src-tauri/src/commands.rs`; per-window permissions in `capabilities/` |

  Capabilities stay narrow and per window: the main window may open https,
  http and mailto URLs plus the one `ms-settings:notifications` page, check
  and install updates, restart, and call the app's own commands; the Quick
  Review window gets only its three commands. There is no filesystem or
  shell plugin — files reach the web app only through Rust's size- and
  type-checked handoff.

### Home-screen widget

A 2×2 `RemoteViews` AppWidget (`AuraMindWidgetProvider.java`) showing cards
due. Not Glance: that needs Kotlin and Compose, and this module is plain Java
with neither.

The widget never reasons about scheduling. Due-ness is an FSRS question the
TypeScript already answers, so `AndroidOverview` publishes the count through
`@capacitor/preferences` (SharedPreferences `CapacitorStorage`) and the
provider only reads it. `MainActivity.onPause` broadcasts the redraw, since a
widget is only looked at after leaving the app.

RemoteViews inflates only a whitelist of view classes — a bare `<View>` makes
the whole layout fail with a grey placeholder and "Couldn't add widget".

### No service worker on native

The PWA service worker is registered on web only, and actively unregistered on
native.

Capacitor serves from `https://localhost`, a fixed origin that never changes
between releases, and worker registrations live in `app_webview/Default/`
which survives app updates. The workbox precache covers `index.html`, so a
still-registered old worker answered navigations from its own cache and booted
the *previous* release's JavaScript. Since every asset already ships in the
APK, that precache could only ever serve an older copy of a local file.

Offline study does not depend on it: that runs on a separate IndexedDB store
with a sync queue (`services/offline/offlineStudyService.ts`).

### Reminders

`useReminderSync` mounts at the app root, and both Settings screens delegate
to it. Syncing only from Settings meant a wrong schedule could never be
repaired for a user who did not open that page.

`'maintain'` (app start) checks the permission and reschedules only if already
granted; `'request'` (Settings) may raise the dialog. Prompting for
notifications at launch is the fastest way to be permanently denied.

---

## Design System

- **Colors**: violet (#8B5CF6 / #7C3AED) on a deep navy ground (#060a16 /
  #080d1b). The prism mark's gradient runs cyan (#72F4FF) → violet → pink
  (#FF9ACD)
- **Typography**: AuraSans (shipped in `public/fonts/`), with AuraScript for
  accents. Not Inter or Space Grotesk — those appear in older token files and
  are not what renders
- **Motion**: cubic-bezier(0.16, 1, 0.3, 1) for entrances; 90ms/160ms for
  press feedback
- **Animation**: Framer Motion + GSAP (ScrollTrigger) + anime.js
- **Component library**: Base UI primitives with custom Tailwind styling

### Editorial layer (Android)

`src/styles/editorial.css` loads after `platform-styles.css` and is scoped to
`.platform-android`, so it overrides by cascade rather than `!important` and
3,477 lines of platform CSS need no hand-editing.

It exists because those styles had drifted rather than been designed: 40 of
~76 font sizes were 8–10px, six near-identical hairline alphas, and eight
radii. The layer imposes a mobile type scale (15px body, 11px tracked caps),
three radii, one hairline, and a 4px spacing rhythm.

Hierarchy comes from type and space, not boxes — the home focus block runs
full-bleed past the page inset, and deck rows are separated by a single
hairline instead of each being a card. That full-bleed is deliberate: a
website never bleeds a panel past its container, and it is the clearest signal
the layout was made for the device rather than ported to it.

---

## Competitive Position (as of mid-2026)

Key differentiators vs competitors (Quizlet, Anki, Knowt, RemNote, StudyFetch, Brainscape):
- AI-powered content generation from multiple input formats
- FSRS-6 via the official `ts-fsrs` (the same algorithm family as Anki)
- Multi-platform: web + native Android and Windows, iOS in progress
- Source-grounded flashcards with citations
- Multi-provider AI with local fallback (no API costs)
- Classroom portal: classes, assignments, and per-student progress

---

## Animation Reference

AuraMind uses Framer Motion + GSAP + anime.js. Key patterns:
- Staggered containers with `staggerChildren: 0.06`
- `whileInView` with `viewport: { once: true }` for scroll reveals
- Spring physics for natural motion: `stiffness: 300, damping: 30`
- Glass cards with `backdrop-filter: blur(20px) saturate(180%)`
- Animated gradients with CSS `@property --angle`
- Respects `prefers-reduced-motion` throughout

---

*Last updated: 2026-09-28*
