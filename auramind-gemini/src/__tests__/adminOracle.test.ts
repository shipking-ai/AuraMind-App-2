/**
 * adminOracle.test.ts — pins the is_admin(uuid) oracle closure without a
 * live database.
 *
 * is_admin(user_uuid) and is_super_admin(user_uuid) take an ARBITRARY uuid,
 * so any signed-in caller could probe whether a given account is an admin.
 * The fix (20260925_close_admin_oracle) revokes client EXECUTE on both and
 * moves the one in-repo consumer (the audit_events SELECT policy) onto
 * current_user_is_admin().
 *
 * This test replays GRANT/REVOKE ON FUNCTION statements across
 * supabase/migrations/*.sql in filename order per function signature and
 * asserts the EFFECTIVE grant — the same way Postgres resolves it — so a
 * future migration that re-grants client access fails CI loudly.
 *
 * No live DB needed: pure file analysis, same pattern as
 * supabaseContract.test.ts.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');

const CLIENT_ROLES = new Set(['authenticated', 'anon', 'public']);
const ORACLE_FUNCTIONS = ['is_admin', 'is_super_admin'];

type Grants = Map<string, Set<string>>; // fn signature -> roles holding EXECUTE

function listMigrations(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => path.join(MIGRATIONS_DIR, f));
}

function signatureOf(name: string, args: string): string {
  // Normalise "user_uuid uuid" / "uuid" to bare type names for stable keys.
  const types = args
    .split(',')
    .map((a) => a.trim().split(/\s+/).pop()!.toLowerCase());
  return `${name.toLowerCase()}(${types.join(',')})`;
}

function replayGrants(): Grants {
  const grants: Grants = new Map();
  const stmt =
    /(grant|revoke)\s+(all\b.*?|execute\b.*?)\s+on\s+function\s+([\w.]+)\s*\(([^)]*)\)\s+(?:to|from)\s+([\w\s,]+?)(;|$)/gi;
  for (const file of listMigrations()) {
    const src = fs.readFileSync(file, 'utf-8');
    for (const m of src.matchAll(stmt)) {
      const [, verb, what, rawName, args, rolesRaw] = m;
      const name = rawName.split('.').pop()!;
      const sig = signatureOf(name, args);
      const roles = rolesRaw
        .split(',')
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean);
      if (!grants.has(sig)) grants.set(sig, new Set());
      const held = grants.get(sig)!;
      if (verb.toLowerCase() === 'grant') {
        for (const r of roles) held.add(r);
      } else {
        // REVOKE [ALL|EXECUTE] — treat both as removing the listed roles.
        // (what distinguishes them is irrelevant for client-role denial.)
        void what;
        for (const r of roles) held.delete(r);
      }
    }
  }
  return grants;
}

function auditPolicyDefinitions(): string[] {
  const defs: string[] = [];
  const re =
    /create\s+policy\s+"Admins can read audit events"[\s\S]*?using\s*\(([\s\S]*?)\)\s*;/gi;
  for (const file of listMigrations()) {
    const src = fs.readFileSync(file, 'utf-8');
    for (const m of src.matchAll(re)) defs.push(m[1]);
  }
  return defs;
}

describe('admin oracle closure', () => {
  it('denies client EXECUTE on is_admin(uuid)/is_super_admin(uuid) in the effective grant', () => {
    const grants = replayGrants();
    for (const fn of ORACLE_FUNCTIONS) {
      const sig = `${fn}(uuid)`;
      const held = grants.get(sig);
      expect(held, `${sig} must appear in a GRANT/REVOKE statement`).toBeDefined();
      for (const role of CLIENT_ROLES) {
        expect(held!.has(role), `${sig} must not be executable by ${role}`).toBe(false);
      }
      expect(held!.has('service_role')).toBe(true);
    }
  });

  it('routes the audit_events admin policy through current_user_is_admin()', () => {
    const defs = auditPolicyDefinitions();
    expect(defs.length).toBeGreaterThan(0);
    const latest = defs[defs.length - 1];
    expect(latest).toContain('current_user_is_admin()');
    // Lookbehind: "current_user_is_admin(" itself contains "is_admin(" —
    // only match the standalone uuid-form gates.
    expect(latest).not.toMatch(/(?<![\w])is_admin\s*\(/);
    expect(latest).not.toMatch(/(?<![\w])is_super_admin\s*\(/);
  });
});
