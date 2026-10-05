#!/usr/bin/env node
/**
 * BonaMind — Migration Status Inspector
 *
 * Prints:
 *   1. Every .sql file in supabase/migrations/ (alphabetical = chronological).
 *   2. Whether each is applied (presence in schema_migrations).
 *   3. Whether the on-disk SHA-256 matches the recorded fingerprint.
 *      If they diverge, the file was edited after being applied — the
 *      classic "ghost migration" bug. The script flags it loudly but
 *      never auto-fixes (re-running a drifted file would corrupt data).
 *
 * Requires SUPABASE_DB_URL or SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 *
 * Usage:
 *   node scripts/migrate-status.js
 *   node scripts/migrate-status.js --json    # machine-readable
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PROJECT_ROOT = path.join(__dirname, '..', '..');
// supabase/migrations/ is the Supabase CLI-managed history; migrations applied
// out-of-band to production via run-migrations.js live in migrations-extra/.
const MIGRATION_DIRS = [
  path.join(PROJECT_ROOT, 'supabase', 'migrations'),
  path.join(PROJECT_ROOT, 'supabase', 'migrations-extra'),
];

const args = process.argv.slice(2);
const json = args.includes('--json');

const DB_URL =
  process.env.SUPABASE_DB_URL ||
  (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? `postgresql://postgres:${encodeURIComponent(process.env.SUPABASE_SERVICE_ROLE_KEY)}@${process.env.SUPABASE_URL.replace(/^https?:\/\//, '').replace(/\/$/, '')}:5432/postgres`
    : null);

if (!DB_URL) {
  console.error('[BonaMind/migrate-status] Missing DB credentials.');
  console.error('  Set SUPABASE_DB_URL=postgres://... OR both SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(2);
}

function sha256(filePath) {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function queryLedger() {
  // Lazy import so the audit can still print file listing without pg if creds missing.
  let pg;
  try {
    pg = require('pg');
  } catch {
    console.error('[BonaMind/migrate-status] Missing optional dep: pg');
    console.error('  Install with: npm install --save-dev pg');
    process.exit(2);
  }
  const client = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT version, description, applied_at, sha256, file_size_bytes, applied_by
      FROM schema_migrations
      ORDER BY applied_at DESC NULLS LAST
    `);
    return rows;
  } finally {
    await client.end();
  }
}

function fmtBytes(n) {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

async function main() {
  const allFiles = MIGRATION_DIRS.flatMap((dir) =>
    fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => f.endsWith('.sql'))
          .filter((f) => f !== 'schema.sql')
          .map((f) => ({ name: f, dir }))
      : [],
  ).sort((a, b) => a.name.localeCompare(b.name));

  if (allFiles.length === 0) {
    console.error(
      `[BonaMind/migrate-status] No migrations found in: ${MIGRATION_DIRS.join(', ')}`,
    );
    process.exit(1);
  }

  console.log(`[BonaMind/migrate-status] ${allFiles.length} migration file(s) on disk:`);
  for (const entry of allFiles) {
    const fp = path.join(entry.dir, entry.name);
    const size = fs.statSync(fp).size;
    console.log(`  • ${entry.name}  (${fmtBytes(size)})  sha256:${sha256(fp).slice(0, 12)}…`);
  }
  console.log('');

  let ledger;
  try {
    ledger = await queryLedger();
  } catch (e) {
    console.error('[BonaMind/migrate-status] DB query failed:', e.message);
    process.exit(2);
  }

  const byVersion = new Map(ledger.map((r) => [r.version, r]));

  // Derive the canonical version name from the filename (strip .sql).
  const rows = allFiles.map((entry) => {
    const f = entry.name;
    const version = f.replace(/\.sql$/, '');
    const row = byVersion.get(version);
    const diskHash = sha256(path.join(entry.dir, f));
    const diskSize = fs.statSync(path.join(entry.dir, f)).size;
    const status = !row
      ? 'PENDING'
      : row.sha256 && !row.sha256.startsWith('pending-re-fingerprint:') && row.sha256 !== diskHash
      ? 'DRIFTED'
      : 'APPLIED';
    return {
      version,
      file: f,
      diskSize,
      diskHash,
      recordedHash: row?.sha256 ?? null,
      recordedSize: row?.file_size_bytes ?? null,
      appliedAt: row?.applied_at ?? null,
      appliedBy: row?.applied_by ?? null,
      description: row?.description ?? null,
      status,
    };
  });

  if (json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  console.log('[BonaMind/migrate-status] Ledger state:');
  const counts = { APPLIED: 0, PENDING: 0, DRIFTED: 0 };
  for (const r of rows) {
    counts[r.status]++;
    const marker =
      r.status === 'APPLIED' ? '✓' : r.status === 'PENDING' ? '·' : '⚠';
    console.log(
      `  ${marker} ${r.status.padEnd(8)} ${r.file}  ` +
        `disk=${r.diskSize}B/sha:${r.diskHash.slice(0, 12)}  ` +
        (r.appliedAt ? `applied=${new Date(r.appliedAt).toISOString()} ` : '') +
        (r.status === 'DRIFTED' ? `MISMATCH recorded=${r.recordedHash?.slice(0, 12)}` : ''),
    );
  }
  console.log('');
  console.log(`  Applied: ${counts.APPLIED}  Pending: ${counts.PENDING}  Drifted: ${counts.DRIFTED}`);

  if (counts.DRIFTED > 0) {
    console.error('');
    console.error('[BonaMind/migrate-status] DRIFT DETECTED:');
    console.error('  The above files were modified AFTER being applied.');
    console.error('  Re-running them WILL corrupt data — investigate before');
    console.error('  running npm run migrate. Use psql to reconcile manually.');
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[BonaMind/migrate-status] unexpected error:', e);
  process.exit(1);
});