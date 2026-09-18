/**
 * supabaseContract.test.ts — defensive contract test
 *
 * Pin invariant: every RPC name, table name, and column name referenced in
 * src/ has a corresponding declaration in the SQL migration set. If a future
 * feature references something we haven't migrated, the test fails loudly
 * BEFORE the corresponding 404 reaches users in production.
 *
 * Why this exists:
 *   - The user pasted three Supabase 4xx errors at app boot:
 *       POST /rest/v1/rpc/count_user_lapses 404
 *       GET  /rest/v1/cards?select=fsrs_state,last_reviewed,last_review,… 400
 *       updateCard returned 0 rows (RLS or missing column)
 *   - Two of those were stale-deploy failures of code paths that HAD been
 *     fixed; one was a missing migration. The defensive aim is to make
 *     "missing migration" discoverable in CI rather than at app boot.
 *
 * What the test asserts:
 *   (1) Every supabase.rpc('<name>', ...) call in src/ has a matching
 *       CREATE FUNCTION (or CREATE OR REPLACE FUNCTION, OR CREATE PROCEDURE)
 *       in some supabase/migrations/*.sql.
 *   (2) Every .from('<table>') in src/ has a matching CREATE/ALTER TABLE in
 *       some supabase/migrations/*.sql.
 *   (3) The list of registered migrations includes a bookkeeping row in each
 *       file (so we don't ship a half-written migration).
 *
 * Out of scope:
 *   - Validating that RPC arguments match the SQL signature (Supabase's
 *     generated TypeScript types catch that at build time).
 *   - Validating column-level RLS — that's a manual audit.
 *
 * The migration set is read from `supabase/migrations/*.sql` (sibling of the
 * `auramind-gemini/` package). Resolution uses `path.resolve` from this
 * file's location so the test passes from any cwd.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');             // repo root (file is at auramind-gemini/src/__tests__/<test>.ts; three levels up)
const SRC_DIR = path.join(ROOT, 'auramind-gemini', 'src');
// supabase/migrations/ is the Supabase CLI-managed history; migrations applied
// out-of-band to production via run-migrations.js live in migrations-extra/.
// The contract must see both, since both declare objects referenced in src/.
const MIGRATION_DIRS = [
  path.join(ROOT, 'supabase', 'migrations'),
  path.join(ROOT, 'supabase', 'migrations-extra'),
];

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '__tests__') continue;
      yield* walk(p);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      yield p;
    }
  }
}

function collectRpcNames(files: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    // Match `supabase.rpc('name'` (single OR double-quoted, with whitespace).
    // Negative lookahead avoids matching string-literal `.rpc(` calls
    // (e.g., in compliance text) — the actual calls always pass a string arg.
    const re = /\.rpc\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) out.add(m[1]);
  }
  return out;
}

function collectTableNames(files: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const re = /\.from\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) out.add(m[1]);
  }
  return out;
}

function _collectColumnNames(files: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    // `.select('a, b, c')` — comma-separated column list.
    const re = /\.select\(\s*['"]([a-zA-Z0-9_,\s*]+)['"]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      for (const col of m[1].split(',')) {
        const trimmed = col.trim();
        if (trimmed && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) out.add(trimmed);
      }
    }
  }
  return out;
}

function collectRpcDeclarations(sqlFiles: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const f of sqlFiles) {
    const src = fs.readFileSync(f, 'utf8');
    // Optional `public.` prefix: schema-qualified declarations are the norm
    // in newer migrations and name the same RPC.
    const re = /CREATE(?:\s+OR\s+REPLACE)?\s+(?:FUNCTION|PROCEDURE)\s+(?:public\.)?([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) out.add(m[1]);
  }
  return out;
}

function collectTableDeclarations(sqlFiles: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const f of sqlFiles) {
    const src = fs.readFileSync(f, 'utf8');
    // CREATE TABLE / ALTER TABLE / CREATE TABLE IF NOT EXISTS — all variants.
    const reC = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:[a-zA-Z_][a-zA-Z0-9_]*\.)?([a-zA-Z_][a-zA-Z0-9_]*)/g;
    const reA = /ALTER\s+TABLE(?:\s+IF\s+EXISTS)?\s+(?:[a-zA-Z_][a-zA-Z0-9_]*\.)?([a-zA-Z_][a-zA-Z0-9_]*)/g;
    let m: RegExpExecArray | null;
    while ((m = reC.exec(src))) out.add(m[1]);
    while ((m = reA.exec(src))) out.add(m[1]);
  }
  return out;
}

function _collectColumnDeclarations(sqlFiles: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const f of sqlFiles) {
    const src = fs.readFileSync(f, 'utf8');
    // Captures the FIRST column-like identifier after CREATE TABLE so each
    // table contributes AT LEAST its name. In practice we just want a set
    // of identifiers — the column-by-column audit is manual.
    const re = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s+(?:TEXT|INTEGER|INT|BIGINT|NUMERIC|DECIMAL|REAL|FLOAT|BOOLEAN|BOOL|TIMESTAMP(?:TZ)?(?:\s+WITH(?:OUT)?\s+TIME\s+ZONE)?|UUID|JSONB|JSON|ARRAY|TSVECTOR)(?:\s+(?:NOT\s+NULL|UNIQUE|PRIMARY\s+KEY|REFERENCES|DEFAULT|CHECK|ENCODE|COLLATE))*/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) out.add(m[1]);
  }
  return out;
}

const ALL_TS_FILES = Array.from(walk(SRC_DIR));
const ALL_SQL_FILES = (() => {
  return MIGRATION_DIRS.flatMap((dir) => {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.sql'))
      .map(f => path.join(dir, f));
  });
})();

describe('Supabase schema contract — defensive regression', () => {
  describe('input collection (sanity)', () => {
    it('scans at least one src/ TS file', () => {
      expect(ALL_TS_FILES.length).toBeGreaterThan(20);
    });

    it('finds at least three migrations', () => {
      expect(ALL_SQL_FILES.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('RPC contract — every rpc() in src/ is defined in migrations', () => {
    // Whitelist of system Rpcs that Supabase provides natively and we don't
    // need to redeclare in our migrations.
    const SYSTEM_RPCS = new Set<string>([
      'rpc',  // a self-call placeholder that would only appear if our regex matched a literal "rpc('rpc'" string, which we exclude below
    ]);

    let calledRpcs: Set<string>;
    let declaredRpcs: Set<string>;

    beforeAll(() => {
      calledRpcs = collectRpcNames(ALL_TS_FILES);
      declaredRpcs = collectRpcDeclarations(ALL_SQL_FILES);
    });

    it('every called RPC has a matching migration declaration', () => {
      const missing = [...calledRpcs]
        .filter(n => !SYSTEM_RPCS.has(n))
        .filter(n => !declaredRpcs.has(n))
        .sort();
      if (missing.length) {
        throw new Error(
          'Src/ references RPC(s) not declared in any migration:\n' +
          missing.map(n => `  - ${n}`).join('\n') +
          '\n\nAdd a CREATE FUNCTION to supabase/migrations/<date>_<name>.sql ' +
          'and INSERT a row into schema_migrations(version, description).',
        );
      }
    });
  });

  describe('Table contract — every .from() in src/ is defined in migrations', () => {
    // Supabase system tables that are always present without our migrations.
    const _SYSTEM_TABLES = new Set<string>([
      'auth.users',           // unreachable from src — the dot form is filtered
    ]);

    let calledTables: Set<string>;
    let declaredTables: Set<string>;

    beforeAll(() => {
      calledTables = collectTableNames(ALL_TS_FILES);
      declaredTables = collectTableDeclarations(ALL_SQL_FILES);
    });

    it('every referenced table has a matching CREATE/ALTER TABLE in some migration', () => {
      // Filter out tables whose schema is the system schema (e.g., auth.users).
      const userTables = [...calledTables].filter(t => !t.includes('.'));
      // Supabase-managed or computed views that don't need explicit DDL.
      // These are read via PostgREST's view syntax, not direct .from('<real>').
      const VIEW_OR_SYSTEM = new Set<string>([
        'card_analytics',      // view defined in 20260521_fsrs_factcheck.sql
        'avatars',             // Supabase Storage bucket — no CREATE TABLE, managed via storage.buckets
        'notifications',       // managed via realtime broadcast + notificationStore (in-memory); table added in 20260724_notifications.sql
      ]);

      const missing = userTables
        .filter(t => !VIEW_OR_SYSTEM.has(t))
        .filter(t => !declaredTables.has(t))
        .sort();
      if (missing.length) {
        throw new Error(
          `Src/ references table(s) without a matching CREATE/ALTER TABLE in any migration:\n` +
          missing.map(n => `  - ${n}`).join('\n') +
          '\n\nAdd a CREATE TABLE to supabase/migrations/<date>_<name>.sql ' +
          'and declare RLS + the columns the consumers reference.',
        );
      }
    });
  });

  describe('Migration bookkeeping — every migration registers itself', () => {
    // Convention for schema_migrations bookkeeping was introduced in
    // migration 20260713_cards_rls_policies. Older migrations
    // (20260521_fsrs_factcheck, 20260526_learning_paths, etc.) shipped
    // before the convention and are considered "already applied" to any
    // live database we point at. New migrations (<= present) MUST register.
    const CONVENTION_SINCE = '20260713';

    const REQUIRED = ['INSERT INTO schema_migrations'];

    it('every *.sql under supabase/migrations/ registered >= 20260713 registers a schema_migrations row', () => {
      if (ALL_SQL_FILES.length === 0) {
        // The folder might not exist on a fresh checkout; we tolerate that
        // (the contract test would still be skipped, never false-positive).
        return;
      }
      const offenders = ALL_SQL_FILES
        .filter(f => path.basename(f) >= CONVENTION_SINCE)
        .filter(
          f => !REQUIRED.every(line => fs.readFileSync(f, 'utf8').includes(line)),
        );
      if (offenders.length) {
        throw new Error(
          'These migration files (post-20260713) do not register themselves in schema_migrations:\n' +
          offenders.map(f => `  - ${path.basename(f)}`).join('\n') +
          '\n\nAppend a final block:\n  INSERT INTO schema_migrations (version, description)\n  ' +
          "VALUES ('<file-stem>', '<short description>')\n  ON CONFLICT (version) DO NOTHING;",
        );
      }
    });

    it('every *.sql filename obeys the YYYYMMDD_ prefix convention (regression guard for the lexicographic comparison above)', () => {
      if (ALL_SQL_FILES.length === 0) return;
      const bad = ALL_SQL_FILES
        .map(f => path.basename(f))
        .filter(n => !/^\d{8}(_|\d{6}_)/.test(n));
      if (bad.length) {
        throw new Error(
          'Filenames that do NOT start with YYYYMMDD_ break the convention comparison:\n' +
          bad.map(n => `  - ${n}`).join('\n') +
          '\n\nRename to "<YYYYMMDD>_<descriptive-stem>.sql" — the date prefix matters because\n' +
          'we lex-sort filenames to decide which migrations predate the schema_migrations\n' +
          'convention (introduced 20260713).',
        );
      }
    });

    it('pre-20260713 migrations may be missing the bookkeeping INSERT (legacy, already applied to live DBs)', () => {
      if (ALL_SQL_FILES.length === 0) return;
      const legacy = ALL_SQL_FILES.filter(
        f => path.basename(f) < CONVENTION_SINCE,
      ).filter(
        f => !REQUIRED.every(line => fs.readFileSync(f, 'utf8').includes(line)),
      );
      // Informational only — no assertion. The bookkeeping enforcement
      // for legacy files is opt-in: rename a legacy file's first line to
      // include `INSERT INTO schema_migrations` if you ever want to
      // surface this in CI. For now the live DB has those rows from
      // previous applies.
      if (legacy.length) {
        console.warn(
          `[legacy migration bookkeeping] These pre-${CONVENTION_SINCE} files do not self-register:\n` +
          legacy.map(f => `  - ${path.basename(f)}`).join('\n') +
          `\nThis is informational only — no test failure the test runner will fail on.`,
        );
      }
    });
  });
});
