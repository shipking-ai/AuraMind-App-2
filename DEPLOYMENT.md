# AuraMind Deployment Guide

## Prerequisites

1. **Node.js 22.22.2 or newer** (CI runs 22 and 24) - [Download](https://nodejs.org/)
2. **npm** or **yarn**
3. **Supabase account** - [Sign up](https://supabase.com)
4. **Vercel account** - [Sign up](https://vercel.com)

## Quick Deploy

### 1. Database Setup (Supabase)

1. Create a new project at [supabase.com](https://supabase.com)
2. Apply the migrations from `supabase/migrations/` in time-stamp order:
   - `node run-migrations.js` from the repo root, or
   - paste each file into the SQL Editor
3. Note your project URL and anon key from Settings → API

### 2. Environment Variables

Copy `.env.example` to `.env` in the `auramind-gemini/` directory:

```bash
cd auramind-gemini
cp .env.example .env
```

Fill in the required values:
- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anon key

AI provider keys (`GROQ_API_KEY`, …) are server-side only and must stay
**unprefixed** — anything `VITE_`-prefixed is published in the browser bundle.

### 3. Deploy to Vercel

```bash
# From project root
npm install -g vercel
vercel
```

Set environment variables in Vercel dashboard:
- Go to Project → Settings → Environment Variables
- Add the variables from `.env.example` (client and server-only; see below)

### 4. Production Deploy

```bash
vercel --prod
```

## Manual Build

```bash
cd auramind-gemini
npm install
npm run build
```

The built files will be in `auramind-gemini/dist/`.

## Windows App (Tauri 2)

The Windows app lives in `auramind-gemini/src-tauri/`. It bundles a desktop
build of the web app (`vite build --mode desktop`, API origins from the
committed `.env.desktop`) and serves it from `https://tauri.localhost`.

```bash
cd auramind-gemini
npm run dev:desktop     # the app window against the Vite dev server
npm run build:desktop   # installer -> src-tauri/target/release/bundle/nsis/
```

Local builds need Rust (`rustup`) and the WebView2 runtime (built into
Windows 10/11). A local `build:desktop` without the signing key below fails at
the updater step; add `--config '{"bundle":{"createUpdaterArtifacts":false}}'`
to build an unsigned installer for testing.

### Updater signing key (one-time)

Installed apps only accept updates signed with the private key that matches
`plugins.updater.pubkey` in `tauri.conf.json`. The key pair was generated with
`npx tauri signer generate` and the private half lives **outside the repo** at
`%USERPROFILE%\.tauri\auramind-updater.key` (no password).

1. Back it up (password manager). **Losing it means no installed copy can ever
   update again**; the only way out is a new key and a manual reinstall for
   every user.
2. Add its contents as the repository secret `TAURI_SIGNING_PRIVATE_KEY`
   (GitHub → Settings → Secrets and variables → Actions).

### Releasing

1. Bump `version` in `auramind-gemini/package.json`. It must be higher than
   any release already installed; the first Windows release must be above
   2.0.0 (the retired June build).
2. Tag and push: `git tag desktop-v2.1.0 && git push origin desktop-v2.1.0`.
3. `Desktop Windows` builds, signs, and creates a **draft** release with the
   installer, its `.sig` and `latest.json`. Review it, then publish.

Installed apps poll `releases/latest/download/latest.json`, so the newest
**published, non-prerelease** GitHub release must always be a desktop one.
Publish any other kind of GitHub release as a pre-release, or the update
check breaks.

Without a code-signing certificate Windows SmartScreen warns on first
install ("Windows protected your PC" → More info → Run anyway). An EV/OV
certificate, or the Microsoft Store, removes that.

## iOS Preview Deploy

A public build of the sample-data iPhone screens (`/__preview/ios?tour=1`)
for reviewing the iOS design in mobile Safari — no sideloading, no account.
The tour uses bundled sample data and makes no network calls, so placeholder
Supabase env is enough.

```bash
cd auramind-gemini
npm run build:ios-preview
```

Then host `dist/` anywhere static, or create a second Vercel project on the
same repo with:

- Build command: `cd auramind-gemini && npm run build:ios-preview`
- Output directory: `auramind-gemini/dist`
- Env: `VITE_IOS_PREVIEW=true`, plus `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` (placeholders are fine — the tour never calls them)

Release builds are unaffected: with `VITE_IOS_PREVIEW` unset, `/__preview/ios`
redirects to `/`.

## Environment Variables

README.md has the full tables. The short version:

### Client (public — shipped in the browser bundle)
| Variable | Description | Where to get |
|----------|-------------|--------------|
| `VITE_SUPABASE_URL` | Supabase project URL (required) | Supabase Dashboard → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (required) | Supabase Dashboard → API |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe for payments | Stripe Dashboard |
| `VITE_POSTHOG_KEY` | PostHog analytics | PostHog project settings |

### Server (Vercel only — never `VITE_`-prefixed)
| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` | Server-side Supabase access |
| `GROQ_API_KEY` | First AI provider (console.groq.com). `CEREBRAS_API_KEY`, `GEMINI_API_KEY` and `OPENROUTER_API_KEY` are failover providers; any one key is enough |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Payments |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Transactional email |

Never set `VITE_GROQ_API_KEY` (or any provider key with a `VITE_` prefix): the
app does not read it, and Vite would publish it to every visitor.

## PWA Setup

1. App icons live in `auramind-gemini/public/favicons,logos/`:
   - `icon-192.png`
   - `icon-384.png`
   - `icon-512.png`
   - plus `favicon.svg`, `favicon.ico`, and the apple-touch icon

2. The OG image is `auramind-gemini/public/favicons,logos/og-image.png` (1200x630px)

3. `manifest.json` references the icons above

## Security Checklist

Verified against the code in this repo (Aug 2026):

- [x] **Security headers** — CSP, HSTS, X-Frame-Options, Referrer-Policy,
      Permissions-Policy set in `api/_middleware.ts` and `vercel.json`.
- [x] **Rate limiting** — per-IP limiter in `api/_middleware.ts` (100 req/min
      default, 30 for AI, 10 for auth) applied to every API route.
- [x] **Cookie consent banner** — `src/components/shared/CookieConsentBanner.tsx`
      (one-time, non-blocking; `analyticsService.init` skips until Accept;
      choice persisted via `auramind_consentChoice` + `auramind_usageAnalytics`,
      changeable in Settings).
- [x] **RLS policies** — created by the append-only migrations in
      `supabase/migrations/` (see `SECURITY.md` for the rules every policy
      follows).
- [x] **Resend API key is server-side only** — transactional email goes through
      `POST /api/email`; the key never ships in the client bundle.
- [x] **Google CSE key is server-side only** — search goes through
      `POST /api/search`; the key never ships in the client bundle.
- [x] **Initial-load JS payload ≤ 500 KB gzipped** — enforced by
      `npm run size` (`scripts/check-bundle-size.mjs`) in CI.

Still requires manual/out-of-band setup (cannot be verified from the repo):

- [ ] All required environment variables set in the **Vercel** project settings
      and `api/.env` (see README env tables).
- [ ] Stripe webhook endpoint configured in the Stripe dashboard with the
      `STRIPE_WEBHOOK_SECRET`.

> ▶ **Full Stripe launch checklist** (key-mode reconciliation, test-mode
> run, live launch steps, monitoring, rollback): see `STRIPE_LAUNCH_CHECKLIST.md`.
- [ ] Custom domain configured with HTTPS in Vercel.
- [x] Apply the migrations in `supabase/migrations/` to the live project
      via `node run-migrations.js` (idempotent — re-running is safe).

## Monitoring

- **PostHog**: User analytics and error tracking
- **Vercel Analytics**: Performance metrics
- **Supabase Logs**: Database queries and auth events

## Troubleshooting

### Build fails
```bash
cd auramind-gemini
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Environment variables not loading
- Ensure variables start with `VITE_` for client-side access
- Restart dev server after changing `.env`
- Check Vercel dashboard for production variables

### Supabase connection errors
- Verify URL and anon key are correct
- Check that RLS policies are set up
- Ensure tables exist (run migration)
