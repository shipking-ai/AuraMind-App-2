# AuraMind Deployment Guide

## Prerequisites

1. **Node.js 18+** - [Download](https://nodejs.org/)
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
- At least one AI provider key (Groq recommended)

### 3. Deploy to Vercel

```bash
# From project root
npm install -g vercel
vercel
```

Set environment variables in Vercel dashboard:
- Go to Project → Settings → Environment Variables
- Add all variables from `.env.example`

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

### Required
| Variable | Description | Where to get |
|----------|-------------|--------------|
| `VITE_SUPABASE_URL` | Supabase project URL | Supabase Dashboard → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key | Supabase Dashboard → API |

### Recommended
| Variable | Description | Where to get |
|----------|-------------|--------------|
| `VITE_GROQ_API_KEY` | Groq AI API key | console.groq.com |

### Optional
| Variable | Description |
|----------|-------------|
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe for payments |
| `VITE_POSTHOG_KEY` | PostHog analytics |
| `RESEND_API_KEY` | Resend for emails |

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
