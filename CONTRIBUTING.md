# Contributing to AuraMind

Thanks for considering a contribution. This document covers the
three things most contributors trip on:

1. **Local setup** — what to install and in what order.
2. **Branching & commit message conventions** — how to structure work.
3. **PR expectations** — the bar a PR needs to clear before review.

## Local setup

```bash
git clone https://github.com/mattycigemp-crypto/AuraMind-App-2.git
cd AuraMind-App-2

npm install                  # orchestration scripts at the root
cd auramind-gemini
npm install                  # the React + Vite frontend
cp .env.example .env         # then paste your keys (see README.md)
cd ..
```

You will need:

- **Node 22+** (22.19 or newer — Vite 8 and jsdom need it; CI runs 22
  and 24).
- There is no desktop build (the old Tauri stack was removed). The Android
  and iOS (Capacitor) apps only need the Android SDK/Java or Xcode toolchain
  if you build them; running the web app needs no native toolchains.

To run only the web app without native toolchains:

```bash
cd auramind-gemini
npm run dev   # http://localhost:3000
```

## Branch & commit conventions

We follow **Conventional Commits** at the message level so release
notes generate automatically.

| Prefix      | Use for                                          |
| ----------- | ------------------------------------------------ |
| `feat:`     | a new user-visible capability                    |
| `fix:`      | a bug                                            |
| `chore:`    | tooling / config / no behavior change            |
| `refactor:` | internal restructure, no behavior change         |
| `docs:`     | README, comments, no code change                 |
| `test:`     | adding or fixing tests                           |
| `ci:`       | GitHub Actions / Dependabot / build pipeline    |
| `db:`       | a Supabase migration (always pairs a migration file) |
| `perf:`     | measurable performance improvement              |
| `revert:`   | rolling back a previous commit                   |

Branch names mirror the prefix: `feat/quick-review-mode`, `fix/cards-rls-leak`.

## Schema migrations

Any change touching the `public` schema **must** ship as a new file in
`supabase/migrations/YYYYMMDD_snake_case.sql`. The migration must be:

- **Append-only** — never `ALTER` a column you added in an earlier
  migration; add a new migration instead.
- **Idempotent** — every `ADD COLUMN`, `DROP POLICY`, and `CREATE INDEX`
  uses the `IF NOT EXISTS` / `IF EXISTS` form.
- **Forward-safe** — a single migration failing in the middle of a
  transaction must not leave the live DB partially migrated. Wrap
  risky ops in `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`.
- **Bookkept** — every migration appends a row to `schema_migrations`
  with version, description, and applied timestamp.

After merging, the on-call maintainer runs the migration against the
production Supabase project — never self-apply to production from a PR.

## Pull requests

Before opening a PR:

```bash
cd auramind-gemini
npm run type-check
npm run lint
npm test
```

PR descriptions should follow `.github/PULL_REQUEST_TEMPLATE.md`. The
maintainer triages by:

1. **Diff size** — PRs under ~400 lines merge in a single review cycle.
   Larger ones get split or requested as drafts.
2. **Test coverage** — behavior changes without a test get sent back.
3. **Schema risk** — migrations require CODEOWNERS review from
   `@mattycigemp-crypto` and a recorded live-DB dry-run.

## Code style

- Frontend / API code in TypeScript with `strict: true`. ESLint is
  configured in `auramind-gemini/eslint.config.js`; Prettier runs with its
  defaults (`npm run format` / `npm run format:check` in `auramind-gemini/`).
- `.editorconfig` enforces UTF-8, LF endings, 2-space indent (4 for
  Supabase migrations and Android/iOS sources).
- Prefer imports from the existing utility folders first; new helpers
  go in `src/lib/auramind/hooks.ts` or a topic-specific module.

## Reporting a bug or security issue

Non-sensitive bugs → open an issue using the **Bug Report** template.

Sensitive security findings → read [SECURITY.md](./SECURITY.md) and
follow the private disclosure path. **Don't open a public issue.**

## Code of conduct

By participating you agree to the [Contributor Covenant v2.1](./CODE_OF_CONDUCT.md).
Maintainers enforce it on PRs, issues, and Discussions.
