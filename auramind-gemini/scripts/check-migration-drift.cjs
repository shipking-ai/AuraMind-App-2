#!/usr/bin/env node
/**
 * BonaMind — Structural Migration-Drift Checker
 *
 * The Supabase migration tooling has bitten this repo twice:
 *
 *   1. PR #33 — two or more files shared an identical timestamp prefix
 *      (e.g. `20260722_a.sql` + `20260722_b.sql`). Supabase keys the
 *      `schema_migrations` ledger on that prefix, so the second file
 *      collided and the preview/push failed with a primary-key error.
 *
 *   2. PR #34 — an 8-digit prefix (`20260721`) and a 14-digit prefix
 *      (`20260721120000`) sort differently in byte order than they do
 *      chronologically (`_` = 0x5F > `1` = 0x31, so the 14-digit file
 *      sorts FIRST in byte order but is chronologically LATER). The CLI's
 *      two-pointer merge desynchronized and reported
 *      "Remote migration versions not found in local migrations directory".
 *
 * This script catches both classes of drift from the files on disk alone —
 * no database credentials required — so it can run on every PR and on a
 * nightly schedule.
 *
 * Checks (per directory, then across the merged set):
 *
 *   ERROR   Duplicate timestamp prefix: two files share the same leading
 *           timestamp. This is a guaranteed ledger collision.
 *   ERROR   Byte-vs-chronological desync *within* supabase/migrations/
 *           (the CLI-managed history): files are not monotonic in
 *           timestamp when sorted by filename. This breaks `db push`.
 *   WARNING Byte-vs-chronological desync that only involves
 *           migrations-extra/ (the out-of-band runner applies in byte
 *           order and the files are typically unrelated) — surfaced so a
 *           real ordering dependency is never introduced silently.
 *   ERROR   Filename with no leading timestamp (unparseable version).
 *
 * Exit codes: 0 = clean (warnings allowed), 1 = drift error, 2 = usage.
 *
 * Usage:
 *   node scripts/check-migration-drift.cjs
 *   node scripts/check-migration-drift.cjs --json
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..', '..');

// supabase/migrations/ is the Supabase CLI-managed history (reconciled with
// supabase_migrations.schema_migrations). migrations-extra/ holds migrations
// applied out-of-band via run-migrations.js, which the CLI does not track.
// The out-of-band runner merges BOTH directories and applies them in byte
// (filename) order.
const MIGRATION_DIRS = [
  { dir: path.join(PROJECT_ROOT, 'supabase', 'migrations'), cliManaged: true },
  { dir: path.join(PROJECT_ROOT, 'supabase', 'migrations-extra'), cliManaged: false },
];

const args = process.argv.slice(2);
const asJson = args.includes('--json');

/**
 * Parse a migration filename into its version (leading timestamp) and name.
 * Supabase filenames are `<version>_<name>.sql`; the version is the leading
 * run of digits before the first underscore/hyphen. Returns null if the name
 * has no leading timestamp.
 */
function parseFilename(filename) {
  const stem = filename.replace(/\.sql$/i, '');
  const m = /^(\d+)(?:[_-]|$)/.exec(stem);
  if (!m) return null;
  return { version: m[1], stem };
}

/**
 * Pad a date-only version (8 digits, e.g. `20260709`) to a full 14-digit
 * timestamp (`20260709000000`) so it sorts correctly against full timestamps
 * (`20260531120000`). Without this, `BigInt('20260709') < BigInt('20260531120000')`
 * is TRUE even though July 9 is after May 31.
 */
function normalizedTimestamp(version) {
  return version.length >= 14 ? version : version.padEnd(14, '0');
}

function collectFiles() {
  return MIGRATION_DIRS.map(({ dir, cliManaged }) => {
    const entries = fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => f.endsWith('.sql'))
          .filter((f) => f !== 'schema.sql')
          .map((name) => ({
            name,
            fullPath: path.join(dir, name),
            cliManaged,
            parsed: parseFilename(name),
          }))
      : [];
    return { dir, cliManaged, entries };
  });
}

// Byte-order comparison (ASCII), matching how fs/glob/CLI sort filenames.
function byteCompare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function report(findings, totalFiles) {
  if (asJson) {
    console.log(
      JSON.stringify(
        { totalFiles, findings },
        null,
        2,
      ),
    );
    return;
  }

  console.log('[BonaMind/migration-drift] structural drift report\n');

  const counts = { duplicate: 0, desyncCli: 0, desyncExtra: 0, unparseable: 0 };
  for (const r of findings) {
    if (r.kind === 'duplicate-version') counts.duplicate++;
    else if (r.kind === 'desync-cli') counts.desyncCli++;
    else if (r.kind === 'desync-extra') counts.desyncExtra++;
    else if (r.kind === 'unparseable') counts.unparseable++;
    const marker = r.severity === 'error' ? '✗' : '⚠';
    console.log(`  ${marker} ${r.file} — ${r.message}`);
  }

  if (findings.length === 0) {
    console.log(`  ✓ no drift across ${totalFiles} migration files`);
  }

  const errors = counts.duplicate + counts.desyncCli + counts.unparseable;
  console.log('');
  console.log(
    `  Total files: ${totalFiles}  Errors: ${errors}  Warnings: ${counts.desyncExtra}`,
  );
  if (errors > 0) {
    console.error('');
    console.error('[BonaMind/migration-drift] DRIFT DETECTED (see ✗ above).');
    console.error('  Fix the offending filenames before merging — see the header');
    console.error('  comment in scripts/check-migration-drift.cjs for the two known');
    console.error('  failure modes (PR #33 duplicate prefixes, PR #34 sort desync).');
  }
}

function main() {
  const dirs = collectFiles();
  const rows = [];

  for (const { dir, cliManaged, entries } of dirs) {
    // 1. Unparseable filenames.
    for (const e of entries) {
      if (!e.parsed) {
        rows.push({
          severity: 'error',
          kind: 'unparseable',
          file: e.name,
          dir,
          message: 'no leading timestamp — Supabase cannot derive a version',
        });
      }
    }

    // 2. Duplicate timestamp prefixes within this directory.
    const byVersion = new Map();
    for (const e of entries) {
      if (!e.parsed) continue;
      if (!byVersion.has(e.parsed.version)) byVersion.set(e.parsed.version, []);
      byVersion.get(e.parsed.version).push(e);
    }
    for (const [version, group] of byVersion) {
      if (group.length > 1) {
        const names = group.map((g) => g.name).join(', ');
        for (const g of group) {
          rows.push({
            severity: 'error',
            kind: 'duplicate-version',
            file: g.name,
            dir,
            message: `version prefix "${version}" is shared by ${group.length} files (${names}) — this collides in the schema_migrations ledger`,
          });
        }
      }
    }
  }

  // 3. Byte-vs-chronological desync.
  //    Within the CLI-managed directory this desynchronizes `db push` (error).
  //    Involving migrations-extra/ it only reorders the out-of-band runner
  //    (warning), but is still worth surfacing.
  for (const scope of [
    { label: 'cli', dirs: MIGRATION_DIRS.filter((d) => d.cliManaged), severity: 'error', kind: 'desync-cli' },
    { label: 'merged', dirs: MIGRATION_DIRS, severity: 'warning', kind: 'desync-extra' },
  ]) {
    const merged = scope.dirs
      .flatMap((d) =>
        (fs.existsSync(d.dir) ? fs.readdirSync(d.dir) : [])
          .filter((f) => f.endsWith('.sql'))
          .filter((f) => f !== 'schema.sql')
          .map((name) => ({
            name,
            dir: d.dir,
            cliManaged: d.cliManaged,
            parsed: parseFilename(name),
          })),
      )
      .filter((e) => e.parsed)
      .sort((a, b) => byteCompare(a.name, b.name));

    for (let i = 1; i < merged.length; i++) {
      const prev = merged[i - 1];
      const curr = merged[i];
      const prevNum = BigInt(normalizedTimestamp(prev.parsed.version));
      const currNum = BigInt(normalizedTimestamp(curr.parsed.version));
      if (currNum < prevNum) {
        // An inversion: curr sorts before prev in byte order but is
        // chronologically earlier. Determine whether it touches the CLI dir.
        const touchesExtra = !prev.cliManaged || !curr.cliManaged;
        if (scope.label === 'cli' && !touchesExtra) {
          rows.push({
            severity: 'error',
            kind: 'desync-cli',
            file: `${prev.name}  <  ${curr.name}`,
            dir: curr.dir,
            message: `byte order puts ${curr.name} (t=${curr.parsed.version}) before ${prev.name} (t=${prev.parsed.version}), but chronologically it is later — this desynchronizes supabase db push`,
          });
        } else if (scope.label === 'merged' && touchesExtra) {
          rows.push({
            severity: 'warning',
            kind: 'desync-extra',
            file: `${prev.name}  <  ${curr.name}`,
            dir: curr.dir,
            message: `merged byte order puts ${curr.name} (t=${curr.parsed.version}) before ${prev.name} (t=${prev.parsed.version}) — harmless only while the two files are independent`,
          });
        }
      }
    }
  }

  // Sort deterministically for stable output.
  rows.sort((a, b) => byteCompare(a.file, b.file));

  const totalFiles = dirs.reduce((n, d) => n + d.entries.length, 0);
  report(rows, totalFiles);

  const hasError = rows.some((r) => r.severity === 'error');
  process.exit(hasError ? 1 : 0);
}

main();
