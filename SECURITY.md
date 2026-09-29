# Security Policy

Thanks for helping keep AuraMind users safe. We take vulnerability
reports seriously and respond within the SLAs below.

## Supported versions

| Version | Supported           |
| ------- | ------------------- |
| latest  | ✅ Active support   |
| previous minor | ✅ Security-only patches |
| anything older than two minor versions | ❌ End-of-life |

## Reporting a vulnerability

**Please do NOT file a public GitHub issue for security bugs.**

Open a **GitHub Security Advisory** privately:

[https://github.com/shipking-ai/AuraMind-App-2/security/advisories/new](https://github.com/shipking-ai/AuraMind-App-2/security/advisories/new)

Include:
- a clear description of the vulnerability and the impact you observed
- reproduction steps (or a screencast / curl transcript)
- the SHA or release tag you reproduced against
- whether you are OK with being credited in the fix announcement

If you cannot use GitHub Security Advisories (e.g. you are reporting
from an account GitHub does not recognize), email **security@auramind.app**
with the same payload. The on-call maintainer reads this inbox daily.

## Our response SLA

| Stage                       | Target          |
| --------------------------- | --------------- |
| Acknowledge report          | within 48 hours |
| Initial triage & severity   | within 7 days   |
| Patch for Critical / High   | within 30 days  |
| Patch for Medium            | within 90 days  |
| Patch for Low / informational | best-effort   |

We will keep you informed of progress and credit you in the release
notes unless you ask to remain anonymous.

## Hardening commitments the project already follows

These are the rules every PR must respect — if you find drift, please
flag it:

- Authorization (roles, admin, subscription status) is read from
  `app_metadata` only. `user_metadata` is writable by the signed-in user
  and is never trusted.
- No provider or server key is ever `VITE_`-prefixed; client env reads go
  through the `CLIENT_ENV` allowlist (enforced by
  `src/__tests__/clientSecretExposure.test.ts`).
- SECURITY DEFINER functions pin `search_path`, `REVOKE EXECUTE` from
  `PUBLIC, anon`, and guard themselves with `auth.uid()`.
- Every new `UPDATE` RLS policy carries a `WITH CHECK` clause.
- No `FOR INSERT|UPDATE|DELETE` policy may be named ending in `(dev)`.
- New tables get at most one permissive policy per `(cmd, table)` pair,
  scoped `TO authenticated` unless anonymous access is intended.
- `.env*` and any `*keystore*/*credentials*` files are `.gitignore`d;
  their absence from the repo is by design.
- Supabase migration files are append-only and idempotent (`ADD COLUMN
  IF NOT EXISTS`, `DROP POLICY IF EXISTS`, etc.).

### Known drift in the live database (checked 2026-09-28)

The last three rules are not yet true of every table. Policies created
before the migrations became the source of truth still exist in the live
project:

- Duplicate permissive policies on the same `(cmd, table)` pair, e.g.
  `cards` (4 commands), `profiles`, `decks`, `league_memberships`.
- `UPDATE` policies without an explicit `WITH CHECK` on `decks`,
  `study_sessions`, `learning_path_enrollments`, `profiles`. Postgres
  falls back to the `USING` expression, so this is a hygiene issue, not an
  open write.
- A legacy `profiles` table has a `USING (true)` SELECT policy. It is not
  reachable from the client — `anon` and `authenticated` hold no grant on
  it — and it is empty; the app uses `user_profiles`.

Consolidating these needs a migration and a live-DB dry-run; until then,
treat them as known and don't copy their pattern.

## Dependency audit status (Sep 28, 2026)

`npm audit --omit=dev` reports **0 vulnerabilities** in all three
packages (`auramind-gemini/`, `api/`, and the repo root). The residuals
listed in the August audit (js-yaml, ws/engine.io-client via puter.js,
react-router 6.x) are resolved.

The weekly `scheduled-checks.yml` run gates at **critical** severity.
Re-run the audit after any major dependency upgrade.

## Recognition

We follow a coordinated disclosure model. Public disclosure of an
issue should wait until either a patch ships or 90 days have elapsed
from the report — whichever comes first.
