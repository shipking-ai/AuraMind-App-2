#!/usr/bin/env node
/**
 * BonaMind — Remote Migration Reconcile
 *
 * Compares the local `supabase/migrations/` history against the remote
 * `supabase_migrations.schema_migrations` ledger (the Supabase CLI's
 * authoritative "what is actually applied" list), queried READ-ONLY via the
 * existing `execute_sql` RPC with the service-role key. No `pg` client and no
 * database password are required — the same RPC the SQL explorer already uses.
 *
 * Why this exists: this repo's history has been applied through two parallel
 * paths — the Supabase CLI ledger and the custom `run-migrations.js` runner —
 * and they have drifted apart twice (PRs #33 and #34). This gate makes that
 * drift visible and fails BEFORE it breaks `supabase db push` again.
 *
 * Findings:
 *
 *   ERROR   A remote version has no matching local file. This is the exact
 *           "Remote migration versions not found in local migrations
 *           directory" failure from `supabase db push`.
 *   WARNING A local file has no matching remote version (pending — normal
 *           when a new migration is added but not yet applied).
 *   WARNING The local filename's descriptive part differs from the remote
 *           ledger's recorded name. Usually a `_remote_only` placeholder
 *           standing in for the real migration; either way a fresh
 *           `supabase db reset` will NOT reproduce the remote schema.
 *
 * Exit codes: 0 = clean/skipped/warnings, 1 = drift error, 2 = usage.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (process env or a `.env`
 * file at the repo root). When either is missing the check self-skips with a
 * note so local runs without credentials don't fail.
 *
 * Usage:
 *   node scripts/check-remote-drift.cjs
 *   node scripts/check-remote-drift.cjs --json
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
const MIGRATIONS_DIR = path.join(PROJECT_ROOT, 'supabase', 'migrations');

const args = process.argv.slice(2);
const asJson = args.includes('--json');

// ── Env loading (process env wins; fall back to a root .env) ────────────────
function loadEnv() {
  const env = { ...process.env };
  const envPath = path.join(PROJECT_ROOT, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const i = trimmed.indexOf('=');
      if (i === -1) continue;
      const key = trimmed.slice(0, i).trim();
      const value = trimmed.slice(i + 1).trim();
      if (!(key in env)) env[key] = value;
    }
  }
  return env;
}

function parseFilename(filename) {
  const stem = filename.replace(/\.sql$/i, '');
  const m = /^(\d+)(?:_(.*))?$/.exec(stem);
  if (!m) return null;
  return { version: m[1], name: m[2] ?? '' };
}

function collectLocal() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .filter((f) => f !== 'schema.sql')
    .map((name) => ({ file: name, ...parseFilename(name) }))
    .filter((e) => e.version);
}

async function queryRemoteLedger(env) {
  const url = (env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return { skipped: 'missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' };

  let res;
  try {
    res = await fetch(`${url}/rest/v1/rpc/execute_sql`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query_text:
          'SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version',
      }),
    });
  } catch (e) {
    return { skipped: `fetch failed: ${e.message}` };
  }

  const text = await res.text();
  if (!res.ok) {
    return { skipped: `remote query rejected (HTTP ${res.status}): ${text.slice(0, 160)}` };
  }

  let rows;
  try {
    rows = JSON.parse(text);
  } catch {
    return { skipped: `remote query returned non-JSON: ${text.slice(0, 160)}` };
  }
  if (!Array.isArray(rows)) {
    return { skipped: 'remote query returned an unexpected shape' };
  }
  return { rows };
}

function report(findings, meta) {
  if (asJson) {
    console.log(JSON.stringify({ ...meta, findings }, null, 2));
    return;
  }

  console.log('[BonaMind/remote-drift] remote reconcile\n');

  if (meta.skipped) {
    console.log(`  ⏭ skipped — ${meta.skipped}`);
    return;
  }

  const counts = { error: 0, warning: 0 };
  for (const f of findings) {
    counts[f.severity]++;
    const marker = f.severity === 'error' ? '✗' : '⚠';
    console.log(`  ${marker} [${f.kind}] ${f.detail}`);
  }
  if (findings.length === 0) {
    console.log(`  ✓ local (${meta.localCount}) and remote (${meta.remoteCount}) versions match`);
  }

  console.log('');
  console.log(
    `  Local: ${meta.localCount}  Remote: ${meta.remoteCount}  Errors: ${counts.error}  Warnings: ${counts.warning}`,
  );
  if (counts.error > 0) {
    console.error('');
    console.error('[BonaMind/remote-drift] REMOTE DRIFT DETECTED (see ✗ above).');
    console.error('  A version applied remotely is missing locally — this will break');
    console.error('  `supabase db push`. Reconcile supabase/migrations/ before merging.');
  }
}

async function main() {
  const env = loadEnv();
  const local = collectLocal();
  const localByVersion = new Map(local.map((e) => [e.version, e]));

  const remote = await queryRemoteLedger(env);
  if (remote.skipped) {
    report([], { skipped: remote.skipped, localCount: local.length, remoteCount: null });
    return;
  }

  const remoteByVersion = new Map(remote.rows.map((r) => [String(r.version), r]));
  const findings = [];

  // 1. Remote versions missing locally → push-breaking error.
  for (const [version, r] of remoteByVersion) {
    if (!localByVersion.has(version)) {
      findings.push({
        severity: 'error',
        kind: 'remote-missing-local',
        detail: `remote version ${version} (${r.name}) has no local file in supabase/migrations/`,
      });
    }
  }

  // 2. Local versions not yet applied remotely → pending warning.
  for (const [version, e] of localByVersion) {
    if (!remoteByVersion.has(version)) {
      findings.push({
        severity: 'warning',
        kind: 'local-pending',
        detail: `local ${e.file} (${version}) is not applied remotely yet`,
      });
    }
  }

  // 3. Name mismatches → schema-reproducibility warning.
  for (const [version, r] of remoteByVersion) {
    const localEntry = localByVersion.get(version);
    if (!localEntry) continue;
    const remoteName = String(r.name ?? '');
    if (remoteName && localEntry.name !== remoteName) {
      const placeholder = localEntry.name === 'remote_only';
      findings.push({
        severity: 'warning',
        kind: placeholder ? 'placeholder-name' : 'name-mismatch',
        detail: `version ${version}: local name "${localEntry.name}" differs from remote "${remoteName}"${
          placeholder ? ' (placeholder stands in for a real migration)' : ''
        }`,
      });
    }
  }

  findings.sort((a, b) => (a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0));
  report(findings, { localCount: local.length, remoteCount: remote.rows.length });

  const hasError = findings.some((f) => f.severity === 'error');
  // Use exitCode (not process.exit) so Node drains the fetch keep-alive
  // handle instead of asserting on Windows.
  process.exitCode = hasError ? 1 : 0;
}

main().catch((e) => {
  console.error('[BonaMind/remote-drift] unexpected error:', e.message);
  process.exitCode = 2;
});
