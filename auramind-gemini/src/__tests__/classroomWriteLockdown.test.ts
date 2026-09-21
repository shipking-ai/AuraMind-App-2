// Classroom tables are written only through SECURITY DEFINER RPCs. A direct
// UPDATE policy on assignments once let a teacher repoint deck_id at another
// user's private deck and copy it via accept_class_deck. These static checks
// pin the lockdown across the migration history and the client.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATIONS_DIR = resolve(__dirname, '../../../supabase/migrations');
const SERVICES_DIR = resolve(__dirname, '../services/classroom');

const TABLES = ['classrooms', 'classroom_memberships', 'assignments', 'assignment_progress'];

const history = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(resolve(MIGRATIONS_DIR, f), 'utf8'))
  .join('\n');

describe('classroom write lockdown', () => {
  it('leaves no write policy on classroom tables', () => {
    const policy = /CREATE POLICY\s+"([^"]+)"\s+ON\s+public\.(\w+)\s+FOR\s+(\w+)/gi;
    const drop = (name: string, table: string) =>
      new RegExp(`DROP POLICY IF EXISTS\\s+"${name}"\\s+ON\\s+public\\.${table}`, 'gi');

    for (const [, name, table, cmd] of history.matchAll(policy)) {
      if (!TABLES.includes(table) || cmd.toUpperCase() === 'SELECT') continue;
      const lastCreate = history.lastIndexOf(`CREATE POLICY "${name}"`);
      const lastDrop = Math.max(-1, ...[...history.matchAll(drop(name, table))].map((m) => m.index ?? -1));
      expect(lastDrop, `${cmd} policy "${name}" on ${table} is still live`).toBeGreaterThan(lastCreate);
    }
  });

  it('revokes table writes from client roles', () => {
    for (const table of TABLES) {
      expect(history).toMatch(
        new RegExp(`REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\\.${table}\\s+FROM anon, authenticated`),
      );
    }
  });

  it('accept_class_deck only copies the assigning teacher\'s own deck', () => {
    const last = history.lastIndexOf('CREATE OR REPLACE FUNCTION public.accept_class_deck');
    const body = history.slice(last, history.indexOf('$$;', last));
    expect(body).toMatch(/user_id = v_assignment\.created_by/);
  });

  it('client services never write classroom tables directly', () => {
    for (const file of readdirSync(SERVICES_DIR)) {
      const src = readFileSync(resolve(SERVICES_DIR, file), 'utf8');
      const direct = new RegExp(
        `from\\(['"](${TABLES.join('|')})['"]\\)[\\s\\S]{0,80}?\\.(insert|update|upsert|delete)\\(`,
      );
      expect(src, file).not.toMatch(direct);
    }
  });
});
