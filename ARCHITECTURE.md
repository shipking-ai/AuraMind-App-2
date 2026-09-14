# AuraMind Architecture & Reference

> Consolidated from all planning documents on 2026-07-08. Refer to `README.md` for setup, `CHANGELOG.md` for version history, `DEPLOYMENT.md` for deployment.

---

## System Overview

AuraMind is a full-stack adaptive AI learning system — it turns any input (PDF, video, lecture, topic) into a personalized course, schedules review with FSRS v5, and tutors with a knowledge model of the user's actual weaknesses. Deployable units:

| Unit | Path | Tech | Purpose |
|---|---|---|---|
| Web SPA | `auramind-gemini/` | React 19 + Vite 6 + Tailwind 4 | Main application (PWA) |
| Android app | `auramind-gemini/android/` | Capacitor 8 | Active native build |
| Backend API | `api/` | Express + Vercel Serverless | Auth, Stripe, admin, chat |

**Key dependencies:** Supabase (auth + DB), Stripe (payments), Resend (email), PostHog (analytics). AI providers: Groq, Cerebras, Gemini, OpenRouter (server-side failover), plus Puter (user-pays) and local Ollama/LM Studio.

---

## Database Schema (Supabase PostgreSQL)

### Core tables
- **decks** — id, user_id, title, description, created_at, source_label, is_sample
- **cards** — id, user_id, deck_id, front/back, next_review, interval, ease_factor, repetition, last_reviewed, source_type, citations (JSONB), trust_score, fsrs_state (JSONB), verified (BOOL)
- **learning_paths** — id, title, description, icon, level, duration, modules, enrolled_count, rating, color
- **learning_path_enrollments** — id, user_id, learning_path_id, progress
- **fact_check_history** — id, user_id, card_id, verified, confidence, checked_at
- **audit_events** — id, actor_id, actor_email, action, category, target_id, target_email, details, severity, created_at
- **chat_logs** — id, user_id, messages, response_preview, tokens_generated, model, duration_ms
- **schema_migrations** — version tracking

All tables have Row Level Security (RLS) policies: users can only access their own data.

---

## Role-Based Permission System

| Permission | Owner | CEO | Admin | Employee | User |
|---|---|---|---|---|---|
| Access Admin Panel | ✓ | ✓ | ✓ | ✓ | ✗ |
| Manage Users | ✓ | ✓ | ✓ | ✗ | ✗ |
| Manage Roles | ✓ | ✓ | ✗ | ✗ | ✗ |
| View Analytics | ✓ | ✓ | ✓ | ✓ | ✗ |
| Manage Coupons | ✓ | ✓ | ✓ | ✗ | ✗ |
| Manage Settings | ✓ | ✓ | ✗ | ✗ | ✗ |
| Delete Users | ✓ | ✗ | ✗ | ✗ | ✗ |
| Free Access | ✓ | ✓ | ✓ | ✗ | ✗ |

Role is read from `app_metadata.role` (synced into `user_profiles.role` by `sync_auth_role_to_profiles`); `user_metadata` is attacker-writable and is **not** trusted for authorization. The owner email is configured via `VITE_OWNER_EMAIL`. Admins skip subscription checks automatically.

---

## AI Integration

### Provider chain

Client AI never holds a provider key. Requests go to `/api/ai`, which fails
over server-side across every provider that has a key configured:

1. **Groq** — `openai/gpt-oss-120b` (default; fastest)
2. **Cerebras** — `llama-3.3-70b`
3. **Gemini** — `gemini-2.0-flash`, via Google's OpenAI-compatible endpoint
4. **OpenRouter** — a `:free` model; broadest choice, easiest to swap

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

Audio transcription still goes to Groq Whisper specifically and does not
participate in the failover chain.

### Key AI services
- `api/_providers.ts` — provider registry + failover policy
- `api/_aiHandler.ts` — the proxy: auth, allowlisting, failover, usage logging
- `groqClient.ts` — client entry point; talks to `/api/ai`, Puter rescue on 429
- `auraAiService.ts` — multi-provider unified chat
- `puterProvider.ts` — user-pays Puter fallback (SDK loaded from its CDN)
- `templateDeckGenerator.ts` — deterministic offline generation
- `_chatHandler.ts` (API) — SSE streaming chat

> `model-service/` (Python FastAPI) is gitignored and local-only — it is not
> part of a fresh clone or the deployed app.

### Chat streaming flow
Client → `/api/chat/stream?message=...&token=...` → Express router → `_chatHandler.ts` → SSE stream from model-service → token-by-token to client. Rate limited: 30 req/min per IP. Responses logged to `chat_logs`.

---

## Spaced Repetition

### SM-2 Algorithm (`src/services/study/srs.ts`)
- Ratings: Again(0), Hard(3), Good(4), Easy(5)
- Successful recall: interval grows geometrically (1d → 6d → interval × easeFactor)
- Failed recall: full reset to 1 day
- Ease factor adjusted by quality (min 1.3)

### FSRS v5 (`src/services/study/fsrs.ts`)
- Replaced SM-2 as primary engine (v2.0.0)
- Stores state as JSONB in `cards.fsrs_state`
- Up to 30% better retention efficiency

---

## API Endpoints

All under `/api` — routed from `api/index.ts`:

| Endpoint | Actions | Auth |
|---|---|---|
| `/api/admin` | list, toggle, utility, test, query, revenue, bulk, audit | Admin JWT |
| `/api/coupons` | list, create, delete | Admin JWT |
| `/api/subscription` | verify | None |
| `/api/chat` | stream (SSE) | Optional |
| `/api/stripe` | checkout, portal | Varies |
| `/api/account` | delete | User JWT |
| `/api/audit` | list, create | Admin JWT |
| `/api/integrations` | notion, anki, obsidian, schoology connect/disconnect | User JWT |

Admin API includes: user role management, test user creation, SQL query explorer (read-only), bulk operations, CSV export, Stripe revenue metrics.

---

## Frontend Architecture

### Route structure (`App.tsx`)
- **Public**: `/` (landing), `/auth`, `/subscribe`, `/docs`, `/privacy`, `/terms`, `/download`, `/reset-password`, `/restore-account`, `/auth/callback`, `/auth/schoology/callback`
- **Protected**: `/dashboard/*`, `/deck/:id`, `/admin/users`, `/admin/check`
- Redirects: old routes → new dashboard routes

### Component tree
```
src/components/
├── achievements/    — Achievement unlock, celebratory feedback
├── auth/            — AuthPage, PaymentPage
├── background/      — Visual effects, neural grid
├── challenges/      — DailyChallenges (dev-mode gated)
├── chat/            — AuraChat, AIChatPage, NotebookLM components
├── dashboard/       — DashboardLayout, Sidebar, MainDashboard, CardsDecks, AIChat, Settings, Analytics
├── deck/            — FlashcardCreator, deck management
├── landing/         — ModernLandingPage (with ProfessionalNavbar, PricingSection, etc.)
├── study/           — Study mode, SRS components
├── quiz/            — Quiz generation and display
├── ui/              — CinematicLoader, CustomCursor, base UI components
├── shared/          — ErrorBoundary, KeyboardAware, HmrRefreshNotice
└── icons/           — CustomIcons
```

### State management
- React Contexts: `LayoutContext`, `DashboardWorkspaceContext`, `SourceDocumentsContext`, `AuraContext`
- Zustand store in `src/lib/auramind/store.ts` (only `cmdOpen` powers the command palette)
- Main app state in `App.tsx` via `useState` + Supabase auth listener

---

## Learning Paths

Six courses, 86 lessons in `src/data/learningPathsData.ts`:
- JavaScript Mastery (ES5 → ES2026)
- React & Modern Frontend (through React 19 hooks)
- Database & SQL (through PostgreSQL 18)
- Machine Learning & AI (RAG, MCP, agentic AI)
- Data Structures & Algorithms
- TypeScript Deep Dive (through TS 6.0)

Enrollment: localStorage-first with best-effort Supabase sync. Lessons open as popups with markdown, breadcrumbs, Previous/Next navigation.

---

## Integrations

- **Notion** — OAuth connect/disconnect
- **Anki** — .apkg import/export
- **Obsidian** — vault path import
- **Quizlet** — username-based connection
- **Schoology** — LMS OAuth (consumer key + access token)
- **Wordnik** — Dictionary definitions
- **Google Search** — Custom search API for research

---

## Native Apps

- **Android** — active Capacitor 8 app at `auramind-gemini/android/`, built
  from the same React source with a native bottom nav, status-bar/back
  handling, haptics, local reminders, and system sharing.

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
- **Desktop** — no desktop build. An earlier Tauri 2 stack was removed;
  recover it from git history if it is ever revived.

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
- FSRS v5 algorithm (matching Anki's latest)
- Multi-platform: web + native Android (desktop stack archived)
- Source-grounded flashcards with citations
- Multi-provider AI with local fallback (no API costs)
- Integrated learning paths with structured curricula

---

## Animation Reference

AuraMind uses Framer Motion + GSAP + Three.js. Key patterns:
- Staggered containers with `staggerChildren: 0.06`
- `whileInView` with `viewport: { once: true }` for scroll reveals
- Spring physics for natural motion: `stiffness: 300, damping: 30`
- Glass cards with `backdrop-filter: blur(20px) saturate(180%)`
- Animated gradients with CSS `@property --angle`
- Respects `prefers-reduced-motion` throughout

---

*Last updated: 2026-07-08*
