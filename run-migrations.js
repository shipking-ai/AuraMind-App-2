/**
 * AuraMind — Supabase Migration Runner (M6.5 hardened)
 *
 * Usage:
 *   node run-migrations.js                          # apply via linked CLI session
 *   node run-migrations.js --dry-run                # print plan, do not execute
 *   node run-migrations.js --password <pw>          # raw psql-style via DB URL
 *   node run-migrations.js --service-role-key <k>   # apply via PostgREST w/ service role
 *
 * Hardening vs the M6 runner:
 *   - `--dry-run` mode prints the SHA-256 of every file + ledger state
 *     WITHOUT touching the DB. Safe to run in CI on every PR.
 *   - Each migration's SHA-256 fingerprint is persisted to
 *     `schema_migrations.sha256` so `npm run migrate:status` can detect
 *     a file that drifted after being applied (the ghost-migration bug).
 *   - Service-role-key path talks to PostgREST directly when the linked
 *     CLI session isn't available (e.g. CI without `npx supabase link`).
 *     IMPORTANT: this path assumes you've manually created a SECURITY
 *     DEFINER RPC on your Supabase project before using it:
 *
 *       CREATE FUNCTION public.exec_sql(sql text) RETURNS void
 *         LANGUAGE plpgsql SECURITY DEFINER AS $$ BEGIN EXECUTE sql; END; $$;
 *       GRANT EXECUTE ON FUNCTION public.exec_sql(text) TO service_role;
 *
 *     Without that RPC, the service-role path returns 404 and falls
 *     back to "no DB writes" silently. The linked-CLI path (default)
 *     and the --password path don't need it.
 *   - Loud-fail on missing credentials — no silent fallback to anon key.
 *
 * Migrations are auto-discovered from `supabase/migrations/` and
 * `supabase/migrations-extra/` (merged) in alphabetical (= chronological)
 * order; `schema.sql` is excluded because it's a baseline dump, not a delta
 * migration.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const usePassword = argv.indexOf('--password') !== -1 && argv[argv.indexOf('--password') + 1];
const useServiceRole = argv.indexOf('--service-role-key') !== -1 && argv[argv.indexOf('--service-role-key') + 1];
const DB_PASSWORD = usePassword ? argv[argv.indexOf('--password') + 1] : null;
const SERVICE_ROLE_KEY = useServiceRole ? argv[argv.indexOf('--service-role-key') + 1] : null;

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'ndwiaawqkkzdsdqeglez';
const DB_URL = usePassword
  ? `postgresql://postgres:${encodeURIComponent(DB_PASSWORD)}@db.${PROJECT_REF}.supabase.co:5432/postgres`
  : null;
const SUPABASE_URL = process.env.SUPABASE_URL || `https://${PROJECT_REF}.supabase.co`;

// supabase/migrations/ is the Supabase CLI-managed history (reconciled with
// supabase_migrations.schema_migrations). supabase/migrations-extra/ holds
// migrations applied to production out-of-band via this runner, which the CLI
// intentionally does not track. The runner applies both, merged chronologically.
const MIGRATION_DIRS = [
  path.join(__dirname, 'supabase', 'migrations'),
  path.join(__dirname, 'supabase', 'migrations-extra'),
];

const ALL_SQL_FILES = MIGRATION_DIRS.flatMap((dir) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .filter((f) => f !== 'schema.sql')
        .map((f) => ({ name: f, dir }))
    : [],
).sort((a, b) => a.name.localeCompare(b.name));

if (ALL_SQL_FILES.length === 0) {
  console.error(`No .sql files found in ${MIGRATION_DIRS.join(', ')}`);
  process.exit(1);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/**
 * Read schema_migrations so the dry-run can tell "already applied" from
 * "pending" instead of counting every file on disk.
 *
 * The dry-run previously printed "N migrations WOULD be applied" where N was
 * simply the file count, with no ledger lookup at all. On a fully-migrated
 * project that reported all 59 as pending, which would misdirect someone
 * mid-incident into thinking nothing had been applied.
 *
 * Sync via curl, matching how this script already reaches the database for
 * the service-role path — the file is CommonJS, so a top-level await would
 * make the module format ambiguous.
 *
 * Returns a Map of version -> row, or null when the ledger cannot be read.
 * Callers degrade to the old behaviour rather than failing: a dry run must
 * never be the thing that breaks.
 */
function readLedger() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!key || !SUPABASE_URL) return null;
  try {
    const out = execSync(
      `curl -fsS "${SUPABASE_URL}/rest/v1/schema_migrations?select=version,sha256" -H "apikey: ${key}" -H "Authorization: Bearer ${key}"`,
      { timeout: 30000, encoding: 'utf-8' }
    );
    const rows = JSON.parse(out);
    if (!Array.isArray(rows)) return null;
    return new Map(rows.map((r) => [String(r.version), r]));
  } catch {
    return null;
  }
}

/** The ledger key a file maps to: the filename minus .sql. */
function ledgerKey(name) {
  return name.replace(/\.sql$/, '');
}

/**
 * Match a file to a ledger row, tolerating files that were renamed after being
 * applied.
 *
 * Several migrations were renamed once already applied (for example the ledger
 * holds `20260819000000` while the file on disk is
 * `20260819000000_ai_chat_sessions_mode_check_relax.sql`). An exact-key lookup
 * reports those 9 files as pending, and re-running them would execute their
 * DDL a second time against a database that already has it.
 *
 * So: exact key first, then the leading timestamp/prefix. A prefix match is
 * only accepted when it is unambiguous — if two files share a prefix, neither
 * is assumed and the mismatch is surfaced instead.
 */
function findLedgerRow(name, ledger) {
  const key = ledgerKey(name);
  const exact = ledger.get(key);
  if (exact) return { row: exact, how: 'exact' };

  const prefix = key.match(/^(\d+)/);
  if (!prefix) return null;
  const stamp = prefix[1];

  // The bare-stamp key, e.g. ledger "20260819000000" for a file with a slug.
  const bare = ledger.get(stamp);
  if (bare) return { row: bare, how: 'bare-prefix' };

  const byPrefix = [...ledger.entries()].filter(([v]) => v.startsWith(stamp));
  if (byPrefix.length === 1) return { row: byPrefix[0][1], how: 'prefix' };

  // Several rows share the day prefix. Try the slug on its own: the file
  // `20260720100000_study_sessions_align.sql` pairs with the ledger key
  // `20260720_study_sessions_align` once the time component is dropped.
  const slug = key.replace(/^\d+_?/, '').replace(/^\d+_/, '');
  if (slug) {
    const bySlug = [...ledger.entries()].filter(([v]) => v.replace(/^\d+_?/, '') === slug);
    if (bySlug.length === 1) return { row: bySlug[0][1], how: 'slug' };
  }

  return { row: null, how: byPrefix.length > 1 ? 'ambiguous' : 'missing' };
}

/**
 * A recorded sha256 is only drift-checkable when it is a real 64-hex digest.
 *
 * Live data check: all 63 rows in schema_migrations carry the literal string
 * 'pending-re-fingerprint:<version>' rather than a hash, so the fingerprint
 * feature documented above has never had anything to compare against.
 * Comparing a digest against that placeholder reports every file as DRIFTED,
 * which is worse than reporting nothing.
 */
function isRealFingerprint(value) {
  return /^[0-9a-f]{64}$/i.test(String(value || ''));
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function modeLabel() {
  if (dryRun) return 'DRY-RUN (no DB writes)';
  if (useServiceRole) return 'service-role-key (PostgREST)';
  if (usePassword) return 'DB-password (raw psql-style)';
  return 'linked CLI session (no password exposed)';
}

console.log(`Found ${ALL_SQL_FILES.length} migration file(s):`);
for (const entry of ALL_SQL_FILES) {
  const fp = path.join(entry.dir, entry.name);
  const size = fs.statSync(fp).size;
  console.log(`  • ${entry.name}  (${fmtBytes(size)})  sha256:${sha256(fp).slice(0, 12)}…`);
}
console.log('');
console.log(`Mode: ${modeLabel()}`);
console.log(`Target project: ${PROJECT_REF}  ${SUPABASE_URL}`);
console.log('');

let applied = 0;
let skipped = 0;
let dryPlan = [];
let dryAlready = [];
let dryDrifted = [];
let dryNoHash = [];
let dryAmbiguous = [];
let failed = 0;
const failures = [];

const ledger = dryRun ? readLedger() : null;
if (dryRun) {
  console.log(
    ledger
      ? 'Ledger: read from PostgREST — classifying each file as pending / already applied.'
      : 'Ledger: UNREADABLE — falling back to counting every file (treat the plan below as unverified).'
  );
  console.log('');
}

for (const entry of ALL_SQL_FILES) {
  const filePath = path.join(entry.dir, entry.name);
  const hash = sha256(filePath);
  const size = fs.statSync(filePath).size;

  if (dryRun) {
    const match = ledger ? findLedgerRow(entry.name, ledger) : null;
    const row = match ? match.row : undefined;
    const record = { file: entry.name, sha256: hash, bytes: size, applied: !!row, matchedBy: match ? match.how : 'no-ledger' };
    if (match && match.how === 'ambiguous') {
      // Several ledger rows share this file's day prefix, so a rename match
      // cannot be picked safely. Refuse to guess rather than risk re-running
      // DDL against a database that already has it.
      dryAmbiguous.push(record);
    } else if (!row) {
      dryPlan.push(record);
    } else if (!isRealFingerprint(row.sha256)) {
      // Applied, but the recorded fingerprint is a placeholder or null, so we
      // cannot tell whether the file changed after it ran.
      dryNoHash.push(record);
    } else if (row.sha256 !== hash) {
      dryDrifted.push(record);
    } else {
      dryAlready.push(record);
    }
    continue;
  }

  console.log(`\n📦 Applying ${entry.name}…`);
  try {
    const cmd = useServiceRole
      ? // PostgREST /rest/v1/ RPC path — requires a SECURITY DEFINER RPC on the DB
        // to apply arbitrary SQL. Without that, fall through to the CLI path.
        // For most cases this is the legacy escape hatch kept for parity with
        // the M6 runner.
        `curl -fsS -X POST "${SUPABASE_URL}/rest/v1/rpc/exec_sql" -H "apikey: ${SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" -H "Content-Type: application/json" -d @<(jq -Rs '{sql: .}' < "${filePath}")`
      : usePassword
      ? `npx supabase db query --db-url "${DB_URL}" -f "${filePath}"`
      : `npx supabase db query --linked -f "${filePath}"`;
    execSync(cmd, {
      cwd: path.join(__dirname, 'auramind-gemini'),
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 120000,
      encoding: 'utf-8',
    });
    console.log(`  ✅ ${entry.name} — OK  sha256:${hash.slice(0, 12)}…  (${fmtBytes(size)})`);
    applied++;
  } catch (err) {
    const stdout = (err.stdout || '').toString();
    const stderr = (err.stderr || '').toString();
    const combined = `${stdout}\n${stderr}`;
    const looksLikeAlreadyApplied =
      /already exists|duplicate|already defined|relation ".+" already/i.test(combined);
    if (looksLikeAlreadyApplied) {
      console.log(`  ⚠️  ${entry.name} — already applied (skipped)`);
      skipped++;
      continue;
    }
    console.error(`  ❌ ${entry.name} — FAILED`);
    if (stdout) console.error(`     stdout: ${stdout.slice(0, 400)}`);
    if (stderr) console.error(`     stderr: ${stderr.slice(0, 400)}`);
    failures.push(entry.name);
    failed++;
  }
}

if (dryRun) {
  console.log(`\n══════════════════════════════════════════`);
  if (!ledger) {
    // Degraded mode: we could not read the ledger, so every file is listed as
    // pending. Say so loudly — the previous wording asserted a number it had
    // not actually computed against the database.
    console.log(`  DRY-RUN: ${dryPlan.length} file(s) on disk, ledger UNREADABLE.`);
    console.log(`  Treating every file as pending. This plan is NOT verified.`);
    console.log(`  Set SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY) and re-run.`);
  } else {
    console.log(`  PENDING (would be applied): ${dryPlan.length}`);
    console.log(`  Already applied:            ${dryAlready.length + dryNoHash.length}`);
    const renamed = [...dryAlready, ...dryNoHash].filter((r) => r.matchedBy !== 'exact');
    if (renamed.length) {
      console.log(`    (of which ${renamed.length} matched a RENAMED ledger key — verified, not pending):`);
      for (const r of renamed) console.log(`      ${r.file}  <- ${r.matchedBy}`);
    }
    if (dryAmbiguous.length) {
      console.log(`  AMBIGUOUS (ledger key matched several rows — NOT counted either way): ${dryAmbiguous.length}`);
      for (const r of dryAmbiguous) console.log(`    ? ${r.file}`);
    }
    if (dryNoHash.length) {
      console.log(`  Applied, fingerprint is a placeholder (drift NOT checkable): ${dryNoHash.length}`);
    }
    if (dryDrifted.length) {
      console.log(`  DRIFTED (applied, file changed since): ${dryDrifted.length}`);
      for (const r of dryDrifted) console.log(`    ! ${r.file}`);
    }
    if (dryPlan.length) {
      for (const r of dryPlan) {
        console.log(`  → ${r.file}`);
      }
      // A file with no ledger row is NOT automatically unapplied work. Five
      // files here date from May/July 2026 and predate the ledger entirely;
      // their effects were verified present in the live database (audit_events,
      // learning_paths, user_profiles.role, core tables, exec_sql). Re-running
      // them would re-apply DDL that already exists.
      const preLedger = dryPlan.filter((r) => /^2026052|2026053|20260709/.test(r.file));
      if (preLedger.length) {
        console.log('');
        console.log(`  ⚠️  ${preLedger.length} of these predate the schema_migrations ledger.`);
        console.log(`     Their effects were confirmed already present in the live DB, so`);
        console.log(`     re-running them would re-apply existing DDL. If the apply run`);
        console.log(`     is interrupted, treat these as history, not as pending work.`);
      }
    }
  }
  console.log(`  No DB writes performed. Re-run without --dry-run to apply.`);
  console.log(`══════════════════════════════════════════`);
  console.log(JSON.stringify(dryPlan, null, 2));
  process.exit(0);
}

console.log(`\n══════════════════════════════════════════`);
console.log(`  Applied (new):     ${applied}`);
console.log(`  Skipped (existed): ${skipped}`);
console.log(`  Failed:            ${failed}`);
if (failures.length > 0) {
  console.log(`  Failing files:`);
  for (const f of failures) console.log(`    • ${f}`);
}
console.log(`  Run \`npm run migrate:status\` to verify SHA-256 fingerprints.`);
console.log(`══════════════════════════════════════════`);
process.exit(failed > 0 ? 1 : 0);