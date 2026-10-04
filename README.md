<div align="center">
  <img src="docs/assets/banner.png" alt="BonaMind — turn anything into a course that sticks" width="100%" />
</div>

# BonaMind

<div align="center">

[![CI](https://img.shields.io/github/actions/workflow/status/shipking-ai/BonaMind-App-2/ci.yml?branch=main&style=flat-square)](https://github.com/shipking-ai/BonaMind-App-2/actions/workflows/ci.yml)
[![Dependabot](https://img.shields.io/badge/dependabot-enabled-025e8b?style=flat-square)](https://github.com/shipking-ai/BonaMind-App-2/network/dependencies)
[![Code style: Prettier](https://img.shields.io/badge/code_style-prettier-ff69b4?style=flat-square)](https://github.com/prettier/prettier)
[![TypeScript: strict](https://img.shields.io/badge/typescript-strict-blue?style=flat-square)](https://www.typescriptlang.org)
[![License: Proprietary](https://img.shields.io/badge/license-proprietary-orange?style=flat-square)](#license)

[🚀 Quick Start](#quick-start) ·
[🤝 Contributing](./CONTRIBUTING.md) ·
[🔒 Security](./SECURITY.md) ·
[📜 Code of Conduct](./CODE_OF_CONDUCT.md)

</div>

An **adaptive AI learning system** — turn anything you're studying (a PDF, a video, a lecture, a topic) into a personalized course of cards, lessons, and quizzes. FSRS spaced repetition (the official `ts-fsrs`, FSRS-6) schedules your reviews; Prof. Aura, the AI tutor, remembers what you actually struggle with — weak cards, concepts, retention, and past conversations — and teaches to those gaps. Freemium via Stripe, all in one repo.

> **Status:** v2.0.0 · web deployed via Vercel · Android in Google Play
> closed testing · iOS builds (unsigned) in CI · Windows app (Tauri 2) built
> in CI, not yet released.
>
> The Android app uses the shared learning UI plus native status-bar/back
> navigation, haptics, local study reminders, system sharing, and mobile
> navigation. The Windows app uses the desktop layout.

## ✅ What's in here

- **Web app** — React 19 + Vite 8 + Tailwind 4, served by Vercel (PWA with offline support).
- **Android app** — a first-class Capacitor 8 build (`auramind-gemini/android/`) generated from the same React source, with a native bottom nav, status-bar/back-button handling, haptics, local reminders, and system sharing.
- **iOS app** — a Capacitor 8 project (`auramind-gemini/ios/`) that the `Mobile iOS` workflow builds unsigned and runs in a simulator. Not yet signed or on TestFlight.
- **Windows app** — a Tauri 2 shell (`auramind-gemini/src-tauri/`) around the bundled web build, with signed auto-updates from GitHub Releases. Built by the `Desktop Windows` workflow; release steps in [DEPLOYMENT.md](./DEPLOYMENT.md#windows-app-tauri-2).
- **Backend** — Vercel serverless functions under `/api`.
- **Database** — Supabase (Postgres) with append-only migrations in `./supabase/migrations/`.

## 🚀 Quick Start

### Prerequisites

- Node.js 22.22.2 or newer (jsdom and Vite 8 need it, and the testing toolchain requires `^22.22.2 || ^24.15.0 || >=26`; CI runs 22 and 24)
- npm
- Git

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/shipking-ai/BonaMind-App-2.git
   cd BonaMind-App-2
   ```

2. **Install dependencies**
   ```bash
   # Install root orchestration dependencies
   npm install

   # Install frontend dependencies
   cd auramind-gemini
   npm install
   cd ..
   ```

3. **Set up environment variables**

   Copy the example environment file:
   ```bash
   cp auramind-gemini/.env.example auramind-gemini/.env
   ```

   Then fill in your keys. Supabase is required; AI, Stripe, email, and
   analytics keys are optional. The full list is in
   [Environment Variables](#environment-variables).

   > **⚠️ Which keys ship to the browser.** Everything prefixed `VITE_` is
   > inlined into the public JS bundle at build time — treat those as
   > public, never as secrets. `RESEND_API_KEY` and `GOOGLE_SEARCH_API_KEY`
   > are **not** `VITE_`-prefixed: they are read server-side only (in the
   > `/api` functions) and must never be prefixed with `VITE_`. The Google
   > Custom Search and email calls go through the API proxy so no third-
   > party key leaves the server.
   >
   > **The client holds no provider key.** `VITE_GROQ_API_KEY` is *not* read
   > by the app and is absent from the `CLIENT_ENV` allowlist in
   > `src/lib/env.ts`. Vite inlines every `VITE_`-prefixed var into the public
   > bundle, so a key there is a spendable credential handed to every visitor.
   >
   > Developer-funded AI still works exactly as before — signed-in users are
   > proxied through `/api/ai`, which injects the server-side `GROQ_API_KEY`.
   > Users without a session fall back to Puter or offline generation.
   >
   > Two rules keep this true, both enforced by
   > `src/__tests__/clientSecretExposure.test.ts`:
   >
   > 1. Never add a provider key to `CLIENT_ENV`. An
   >    `import.meta.env.DEV` guard is **not** sufficient — it was tried, and
   >    the literal still reached the bundle.
   > 2. Never index `import.meta.env[name]` dynamically. Vite cannot analyse
   >    it, so it inlines the *entire* env object and publishes every `VITE_`
   >    var at once. Use `readClientEnv()` instead.

4. **Start the development server**
   ```bash
   npm run dev
   ```

   The web app is at `http://localhost:3000`; the API dev server runs
   alongside it on `http://localhost:3001`.

## 📁 Project Structure

```
BonaMind-App-2/
├── api/                      # Backend API (Vercel serverless + Express dev server)
│   ├── index.ts              # Route handler for every /api endpoint
│   ├── stripe-webhook.ts     # Stripe webhook handler
│   ├── server.js             # Express dev server (port 3001)
│   ├── routes/               # Express routes
│   ├── scripts/              # One-off verification/launch scripts
│   └── tests/                # API tests
├── auramind-gemini/          # Frontend React application (web + Android)
│   ├── src/
│   │   ├── components/       # React components (incl. native/ for Android)
│   │   ├── pages/            # Route pages
│   │   ├── hooks/            # Custom React hooks
│   │   ├── services/         # API clients, DB modules, AI providers
│   │   ├── lib/              # Pure logic (FSRS, prompts, memory)
│   │   ├── contexts/         # React context providers
│   │   ├── types/            # TypeScript type definitions
│   │   └── __tests__/        # Vitest suite
│   ├── android/              # Capacitor 8 Android project
│   ├── ios/                  # Capacitor 8 iOS project (CI-built, unsigned)
│   ├── public/               # Static assets (PWA manifest, icons)
│   └── package.json
├── supabase/
│   └── migrations/           # Append-only, idempotent SQL migrations
├── model-service/            # Gitignored, local-only Python experiment (not deployed)
├── docs/                     # Store-submission playbook + README assets
├── store/                    # App store listings, screenshots, checklists
├── vercel.json               # Vercel deployment configuration
├── run-migrations.js         # Migration runner (node run-migrations.js)
└── package.json              # Root orchestration scripts
```

## 🔧 Environment Variables

### Required Variables

| Variable | Description | Where to get |
|----------|-------------|--------------|
| `VITE_SUPABASE_URL` | Supabase project URL | Supabase Dashboard → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key | Supabase Dashboard → Settings → API |

These two are the only variables the app refuses to start without. Email,
AI, and payments are configured server-side (see the backend table below).

### Optional Variables

Client variables are read only if they are listed in the `CLIENT_ENV`
allowlist in `src/lib/env.ts`.

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_BASE_URL` | API origin, for builds not served from the API's own origin (e.g. native) | same origin |
| `VITE_USE_LOCAL_AI` | Enable local AI server (LM Studio/Ollama) | `false` |
| `VITE_USE_PUTER` | Offer the user-pays Puter fallback | `true` |
| `VITE_AI_MODEL` | Model name shown in the admin settings readout. The server picks models itself (`GROQ_MODEL`, …) | - |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key | - |
| `VITE_STRIPE_PRICE_ID_MONTHLY` | Stripe monthly price ID | - |
| `VITE_STRIPE_PRICE_ID_ANNUAL` | Stripe annual price ID | - |
| `VITE_POSTHOG_KEY` | PostHog analytics key | - |
| `VITE_OWNER_EMAIL` | Owner email (grants admin automatically) | - |
| `VITE_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key. Auth still works without it, but Supabase rejects captcha-gated calls once CAPTCHA is enabled there | - |

### Backend Environment Variables (Vercel)

These should be set in Vercel project settings:

None of these may be `VITE_`-prefixed — that would publish them to the browser.

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL (server side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key. Writes `app_metadata`, which is what entitlement is read from |
| `STRIPE_SECRET_KEY` | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `RESEND_API_KEY` | Resend API key for emails |
| `RESEND_FROM_EMAIL` | Sender address on a Resend-verified domain. Defaults to `noreply@mail.bonamind.app` |
| `APP_ORIGIN` | Canonical web origin (`https://bonamind.app`). Drives the CORS allowlist, Stripe return URLs, and links in transactional email. Set this when the domain changes — see below. |
| `GROQ_API_KEY` | First AI provider in the chain |
| `CEREBRAS_API_KEY` | Second — tried when Groq returns 429/5xx |
| `GEMINI_API_KEY` | Third |
| `OPENROUTER_API_KEY` | Fourth. Any one key is enough; the endpoint only 503s when all are unset |
| `GOOGLE_SEARCH_API_KEY` | Programmable Search, for grounded answers |
| `GOOGLE_SEARCH_ENGINE_ID` | Programmable Search engine id |
| `UPSTASH_REDIS_REST_URL` | Distributed rate limiting. Without it the limiter falls back to per-instance memory, which does not hold across serverless invocations |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash token |
| `CRON_SECRET` | Authenticates scheduled jobs (dunning). Unset means those endpoints reject every call |
| `ADMIN_EMAIL` | Operational alerts |
| `FCM_PROJECT_ID` | Firebase project for push. Push stays off (fails closed) until both FCM vars are set |
| `FCM_SERVICE_ACCOUNT_KEY` | Firebase service-account key JSON, raw or base64 |

The Turnstile **secret** is not here — it belongs in Supabase under
Authentication → Attack Protection, since Supabase verifies the token.

## 🏗️ Build & Deployment

### Local Build

```bash
cd auramind-gemini
npm run build
```

### Android Build

```bash
cd auramind-gemini
npm run build:apk:debug      # debug APK (assembleDebug)
npm run build:aab:release    # release AAB (requires signing env vars)
```

The debug APK lands at `android/app/build/outputs/apk/debug/app-debug.apk`.

### Releasing to Google Play

Releases go through the `Mobile Android` workflow rather than a local build,
so the signing key never leaves CI:

```bash
gh workflow run mobile-android.yml --ref main -f track=alpha -f status=draft
```

- **`track`** — `internal`, `alpha`, `beta` or `production`. `alpha` is closed
  testing, and the only track that counts toward the 12-testers-for-14-days
  requirement gating production for personal accounts created after
  2023-11-13.
- **`status`** — `draft` until one release has been published by hand from the
  console. Play refuses anything else while an app is still a "draft app":
  *"Only releases with status draft may be created on draft app."* After the
  first publish, `completed` makes a dispatch go live on its track.

`versionCode` comes from `github.run_number`, so it is monotonic and a rerun
can never collide with a code Play has already consumed. Play burns a
versionCode permanently on upload.

See `docs/M6-store-submission-playbook.md` for the full publishing flow.

### Vercel Deployment

1. **Install Vercel CLI**
   ```bash
   npm install -g vercel
   ```

2. **Deploy to Vercel**
   ```bash
   vercel
   ```

3. **Set environment variables in Vercel Dashboard**
   - Go to your Vercel project → Settings → Environment Variables
   - Add all required variables from the table above

4. **Deploy to production**
   ```bash
   vercel --prod
   ```

### Changing the domain

The product name and the domain are separate concerns:

| What | Where it lives | How to change it |
|---|---|---|
| Display name | `auramind-gemini/app-identity.ts` | Edit `APP_NAME`, then `npm run brand:sync` |
| Domain | `APP_ORIGIN` env var (API), `SITE_URL` in `src/lib/seo.ts` (web) | Set the env var, update the constant |

`APP_ORIGIN` is the one that matters operationally. It feeds the CORS
allowlist, the Stripe `success_url`/`cancel_url`/billing-portal return URLs,
and every link in a transactional email. In production the CORS allowlist only
echoes a recognised origin and sends **no header** for an unknown one, so a
missed update presents as a generic network failure in the browser — the app
looks like it hangs rather than reporting a CORS error. Set `APP_ORIGIN`
first, then deploy.

Two things that do **not** change with the domain:

- **`com.bonamind.app`** — the package id. Play and the App Store key listings
  to it permanently, so changing it orphans the listing and any in-progress
  closed test. It is deliberately excluded from `app-identity.ts`.
- **Supabase project URL** — auth and the database live on `*.supabase.co`, so
  users are not logged out by a domain change.

Add a 301 from the old domain to the new one so shared links keep working.

## 🧪 Testing

### Run Tests

```bash
cd auramind-gemini
npm test
```

### Type Checking

```bash
cd auramind-gemini
npm run type-check
```

## 🔑 API Services Setup

### Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com).
2. Apply the migrations from [`supabase/migrations/`](./supabase/migrations/)
   in **time-stamp order**. They are append-only and idempotent — each picks
   up where the previous one left off, and every one writes a bookkeeping row
   to `schema_migrations`. Apply them one of three ways:

   - `node run-migrations.js` from the repo root (uses the Supabase CLI),
   - `npx supabase db push` or `supabase migration up` with the Supabase CLI, or
   - paste each file into the Supabase SQL Editor.

   **The schema is intentionally NOT reproduced in this README.**
   It goes stale as soon as the next migration ships. The directory of
   numbered `.sql` files is the single source of truth, and
   `schema_migrations ORDER BY applied_at DESC` tells you which ones
   the live DB currently has.

To check what has been applied:

```sql
SELECT version, applied_at, description
FROM   schema_migrations
ORDER  BY applied_at DESC;
```

### Stripe Setup

1. Create a Stripe account at [stripe.com](https://stripe.com)
2. Create products and prices for subscriptions
3. Add webhook endpoint for your Vercel deployment
4. Configure webhook events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.trial_will_end`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

> See `STRIPE_LAUNCH_CHECKLIST.md` for the full go-live runbook.

### Resend Setup (Email)

1. Create account at [resend.com](https://resend.com)
2. Verify your domain (e.g., `bonamind.app`)
3. Create API key
4. Set `RESEND_FROM_EMAIL` to a verified address on your domain

## 🎨 Features

- **AI tutor (Prof. Aura)** — a conversational coach that remembers your weak cards, concepts, retention, and past conversations, then teaches to the gaps.
- **AI generation** — turn a topic, PDF, video, URL, or voice memo into flashcards, quizzes, and narrated slides.
- **FSRS spaced repetition** — reviews scheduled by the official `ts-fsrs` (FSRS-6), not a fixed interval.
- **Classroom portal** — teachers create classes, students join with a 6-character code, and teachers assign decks and graded quizzes and track per-student progress.
- **Memory sparks** — cards that are fading (not yet forgotten) resurface as in-app pop-ups, notifications, and mixed into study sessions.
- **Native Android app** — Capacitor 8 shell with status-bar/back navigation, haptics, local reminders, system sharing, and offline study.
- **Offline-first PWA** — cached decks and cards, queued reviews, and reconnect sync.
- **Voice study** — text-to-speech cards and hands-free review.
- **Gamification** — streaks, mastery stats, and progress analytics.
- **Freemium via Stripe** — hosted Checkout, signed webhooks, and entitlement read from `app_metadata` only.
- **Multiple AI providers** — server-side failover across Groq, Cerebras, Gemini and OpenRouter (any one key is enough), with a user-pays Puter fallback, optional local Ollama/LM Studio, and deterministic offline generation as the floor.

## 📊 Tech Stack

- **Frontend**: React 19, TypeScript 6 (strict), Vite 8, Tailwind CSS 4, React Router 7
- **UI Components**: Base UI and Radix primitives, Framer Motion, GSAP, custom SVG icon set
- **Mobile**: Capacitor 8 (Android; iOS in CI)
- **Desktop**: Tauri 2 (Windows)
- **Backend**: Vercel Serverless Functions (Express dev server locally)
- **Database**: Supabase (PostgreSQL, RLS)
- **Payments**: Stripe
- **Email**: Resend
- **AI**: Groq / Cerebras / Gemini / OpenRouter with automatic failover, Puter (user-pays) fallback, optional local AI (Ollama/LM Studio)

## 🐛 Troubleshooting

### Build Errors

If you encounter build errors:

```bash
# Clear cache and reinstall
cd auramind-gemini
rm -rf node_modules package-lock.json
npm install
```

### Environment Variables Not Loading

- Ensure your `.env` file is in the `auramind-gemini/` directory
- Restart the development server after changing environment variables
- Variables must start with `VITE_` **and** be listed in `CLIENT_ENV` (`src/lib/env.ts`) to be available in the browser

### API Errors

- Check that all backend environment variables are set in Vercel
- Verify Supabase connection string and credentials
- Ensure Stripe webhook is properly configured

## 📝 License

Proprietary — All rights reserved. © 2026 CogniVect, Inc.
BonaMind and the BonaMind mark are trademarks of CogniVect, Inc.
No part of this codebase is licensed for redistribution.

## 📚 Governance

- [CONTRIBUTING.md](./CONTRIBUTING.md) — local setup, branch + commit
  conventions, schema migration rules, and PR expectations.
- [SECURITY.md](./SECURITY.md) — how to privately report a vulnerability
  and the SLAs the maintainer commits to.
- [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) — community norms
  (Contributor Covenant v2.1).

## 🤝 Support

- Bug reports → open an issue using the
  [Bug Report template](./.github/ISSUE_TEMPLATE/bug_report.yml).
- Feature ideas → open an issue using the
  [Feature Request template](./.github/ISSUE_TEMPLATE/feature_request.yml).
- Security issues → see [SECURITY.md](./SECURITY.md); do **not** open
  a public issue.
