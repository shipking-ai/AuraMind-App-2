# BonaMind — Agent Cheat Sheet

BonaMind is an adaptive AI learning system: turn anything (PDF, video, lecture,
topic) into a course of cards/lessons/quizzes, schedule review with FSRS (`ts-fsrs`, FSRS-6), and
tutor with **Prof. Aura**, an AI that models the user's real weaknesses.

Canonical docs (read these first, not this file):

- `README.md` — what the product is, quick start, env vars, build/deploy.
- `ARCHITECTURE.md` — system structure, schema, RLS/permissions, AI chain, routes.
- `CONTRIBUTING.md` — local setup, Conventional Commits, migration rules, PR bar.
- `SECURITY.md` — private vulnerability reporting.
- `CHANGELOG.md` — release history.
- `HANDOFF.md` — current state, outstanding work, and traps that cost real time.
- `DEPLOYMENT.md` / `STRIPE_LAUNCH_CHECKLIST.md` — deploy and billing runbooks.

## Surfaces

| Surface | Path | Notes |
|---|---|---|
| Web app | `auramind-gemini/` | React 19 + Vite 8 + Tailwind 4 + React Router 7, served by Vercel (PWA) |
| Android app | `auramind-gemini/android/` | Active Capacitor 8 build, generated from the same React source |
| iOS app | `auramind-gemini/ios/` | Capacitor 8, built unsigned in CI (`mobile-ios.yml`); not yet on TestFlight |
| Windows app | `auramind-gemini/src-tauri/` | Tauri 2 around the bundled web build (`--mode desktop`), served from `https://tauri.localhost`; signed auto-updates from GitHub Releases (`desktop-windows.yml`) |
| Backend | `api/` | Vercel serverless (`index.ts` + `stripe-webhook.ts`) with an Express dev server (`server.js`, port 3001) |
| Database | `supabase/migrations/` | Append-only, idempotent SQL migrations (source of truth for schema) |

## Commands (run inside `auramind-gemini/` unless noted)

```bash
npm run dev            # Vite dev server (port 3000)
npm run type-check     # tsc --noEmit
npm run lint           # ESLint
npm test               # Vitest suite
npm run build          # production build
npm run build:apk:debug    # Capacitor sync + debug APK
npm run build:aab:release  # Capacitor sync + release AAB (needs signing env vars)
npm run dev:desktop    # Windows app (Tauri) against the dev server
npm run build:desktop  # Windows installer (needs Rust; see DEPLOYMENT.md)
npm run migrate        # node ../run-migrations.js
npm run diagnostics    # migration drift + remote ledger checks
```

From the repo root, `npm run dev` starts web (3000) + API (3001) together.

## Key conventions

- **Migrations** — every `public`-schema change ships as a new
  `supabase/migrations/YYYYMMDD_snake_case.sql` file: append-only, idempotent,
  bookkept in `schema_migrations`. Never self-apply to production from a PR.
- **Commits** — Conventional Commits (`feat:`, `fix:`, `db:`, `chore:`, …);
  branch names mirror the prefix. No `Codebuff` attribution.
- **RLS** — every table is row-level secured via `auth.uid()`; admin gates use
  `is_admin(auth.uid())` / `current_user_is_admin()` (app metadata), never
  trust `user_metadata` for authorization.
- **Entitlement** — billing follows the same rule and for the same reason:
  `subscription_status` lives in `app_metadata` and is read through
  `api/_lib/entitlement.ts`. It once lived in `user_metadata`, which a
  signed-in user can write with one `auth.updateUser` call, so any account
  could grant itself a permanent subscription. That reader has **no fallback**
  to `user_metadata` on purpose — adding one restores the whole hole.
- **Env** — `VITE_`-prefixed vars ship to the browser (public). Server-only
  keys (`RESEND_API_KEY`, `STRIPE_*`, `SUPABASE_SERVICE_ROLE_KEY`,
  `GOOGLE_SEARCH_API_KEY`, `GROQ_API_KEY`) must never be `VITE_`-prefixed.
  Client reads go through `readClientEnv()` and the `CLIENT_ENV` allowlist in
  `src/lib/env.ts` — never `import.meta.env[name]`, which defeats Vite's
  per-variable substitution and inlines the whole env object (publishing
  every `VITE_` var). An `import.meta.env.DEV` guard does not prevent this;
  omission from the allowlist is the control. Enforced by
  `src/__tests__/clientSecretExposure.test.ts`.

## Author

CogniVect, Inc. — proprietary, all rights reserved.
