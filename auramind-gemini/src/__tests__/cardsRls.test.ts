/**
 * cardsRls.test.ts — pins the cards RLS consolidation without a live database.
 *
 * cards used to carry two permissive policies per command ("own cards" and
 * "cards in own decks"). Permissive policies OR together, so a user could
 * write their own card into someone else's deck, and a deck owner could hand
 * a card to another user. 20260929_cards_rls_owner_and_deck requires BOTH
 * card ownership and deck ownership on every command.
 *
 * This replays CREATE/DROP POLICY across supabase/migrations/*.sql in
 * filename order and asserts the effective policy set, so a later migration
 * that re-adds a one-sided cards policy fails CI. The legacy policies were
 * created outside the migrations (base schema), so the test also checks the
 * consolidation migration drops every one of them by its live name.
 *
 * Same file-analysis pattern as adminOracle.test.ts.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');
const CONSOLIDATION = '20260929_cards_rls_owner_and_deck.sql';

// The eight one-sided policies that existed in the live project.
const LEGACY_CARD_POLICIES = [
  'Users can view own cards',
  'Users can view cards in own decks',
  'Users can insert own cards',
  'Users can create cards in own decks',
  'Users can update own cards',
  'Users can update cards in own decks',
  'Users can delete own cards',
  'Users can delete cards in own decks',
];

interface Policy {
  cmd: string;
  body: string;
}

function listMigrations(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => path.join(MIGRATIONS_DIR, f));
}

function stripComments(sql: string): string {
  return sql.replace(/--[^\n]*/g, '');
}

/** Effective policies per table after replaying every migration in order. */
function replayPolicies(): Map<string, Map<string, Policy>> {
  const tables = new Map<string, Map<string, Policy>>();
  const forTable = (t: string) => {
    const key = t.replace(/^public\./i, '').toLowerCase();
    if (!tables.has(key)) tables.set(key, new Map());
    return tables.get(key)!;
  };
  const stmt =
    /(drop\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"\s+on\s+([\w.]+)\s*;)|(create\s+policy\s+"([^"]+)"\s+on\s+([\w.]+)\s+(?:as\s+\w+\s+)?for\s+(\w+)([\s\S]*?);)/gi;
  for (const file of listMigrations()) {
    const src = stripComments(fs.readFileSync(file, 'utf-8'));
    for (const m of src.matchAll(stmt)) {
      if (m[1]) {
        forTable(m[3]).delete(m[2]);
      } else {
        forTable(m[6]).set(m[5], { cmd: m[7].toUpperCase(), body: m[8] });
      }
    }
  }
  return tables;
}

const OWNS_CARD = /\(select auth\.uid\(\)\)\s*=\s*user_id/i;
const OWNS_DECK = /exists\s*\(\s*select 1 from public\.decks d\s+where d\.id = cards\.deck_id and d\.user_id = \(select auth\.uid\(\)\)\s*\)/i;

describe('cards RLS: card AND deck ownership', () => {
  it('the consolidation migration drops every legacy one-sided cards policy', () => {
    const src = fs.readFileSync(path.join(MIGRATIONS_DIR, CONSOLIDATION), 'utf-8');
    for (const name of LEGACY_CARD_POLICIES) {
      expect(src, `must drop "${name}"`).toContain(`DROP POLICY IF EXISTS "${name}"`);
    }
  });

  it('leaves exactly one cards policy per command, each requiring both ownerships', () => {
    const cards = replayPolicies().get('cards');
    expect(cards).toBeDefined();
    const byCmd = new Map<string, Policy[]>();
    for (const p of cards!.values()) {
      byCmd.set(p.cmd, [...(byCmd.get(p.cmd) ?? []), p]);
    }
    for (const cmd of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const policies = byCmd.get(cmd) ?? [];
      expect(policies, `cards ${cmd} policy count`).toHaveLength(1);
      const body = policies[0].body.replace(/\s+/g, ' ');
      expect(body, `cards ${cmd} must be scoped to authenticated`).toMatch(/to authenticated/i);
      expect(body, `cards ${cmd} must require card ownership`).toMatch(OWNS_CARD);
      expect(body, `cards ${cmd} must require deck ownership`).toMatch(OWNS_DECK);
    }
    expect(byCmd.has('ALL'), 'no FOR ALL policy on cards').toBe(false);
  });

  it('checks both ownerships on the NEW row of a cards UPDATE', () => {
    const update = [...replayPolicies().get('cards')!.values()].find((p) => p.cmd === 'UPDATE')!;
    const withCheck = update.body.split(/with\s+check/i)[1] ?? '';
    expect(withCheck, 'UPDATE needs an explicit WITH CHECK').not.toBe('');
    expect(withCheck).toMatch(OWNS_CARD);
    expect(withCheck).toMatch(OWNS_DECK);
  });

  it('gives decks and study_sessions UPDATE an explicit WITH CHECK', () => {
    const tables = replayPolicies();
    for (const [table, name] of [
      ['decks', 'Users can update own decks'],
      ['study_sessions', 'Users can update own study sessions'],
    ] as const) {
      const p = tables.get(table)?.get(name);
      expect(p, `${table} "${name}"`).toBeDefined();
      expect(p!.body).toMatch(/with\s+check\s*\(\s*\(select auth\.uid\(\)\)\s*=\s*user_id\s*\)/i);
    }
  });

  it('keeps league standings signed-in only', () => {
    const tables = replayPolicies();
    expect(tables.get('league_memberships')?.has('Anyone can read league memberships')).toBe(false);
    expect(tables.get('league_seasons')?.has('Anyone can read league seasons')).toBe(false);
    expect(tables.get('league_memberships')?.get('Authenticated members read league standings')?.body)
      .toMatch(/to authenticated/i);
  });
});
