import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MIGRATION_MARKER,
  legacyKeyTarget,
  migrateLegacyKeys,
  migrateLegacyKeysAsync,
  preferencesStore,
  type SyncKeyStore,
} from '../lib/storageMigration/legacyKeys';

/** A Map-backed store; `failSet`/`failGet` make one key throw. */
function memoryStore(seed: Record<string, string>, opts: { failSet?: string; failGet?: string } = {}) {
  const map = new Map(Object.entries(seed));
  const store: SyncKeyStore = {
    keys: () => [...map.keys()],
    get: (k) => {
      if (k === opts.failGet) throw new Error('read failed');
      return map.has(k) ? map.get(k)! : null;
    },
    set: (k, v) => {
      if (k === opts.failSet) throw new Error('QuotaExceededError');
      map.set(k, v);
    },
    remove: (k) => {
      map.delete(k);
    },
  };
  return { map, store };
}

describe('legacyKeyTarget', () => {
  it('maps each legacy separator and only the leading prefix', () => {
    expect(legacyKeyTarget('auramind_theme')).toBe('bonamind_theme');
    expect(legacyKeyTarget('auramind-saved-quizzes')).toBe('bonamind-saved-quizzes');
    expect(legacyKeyTarget('auramind.aurachat.sessions.v1')).toBe('bonamind.aurachat.sessions.v1');
    expect(legacyKeyTarget('auramind:quiz:auramind_x')).toBe('bonamind:quiz:auramind_x');
    expect(legacyKeyTarget('auramindtheme')).toBeNull();
    expect(legacyKeyTarget('bonamind_theme')).toBeNull();
    expect(legacyKeyTarget('other_auramind_x')).toBeNull();
  });
});

describe('migrateLegacyKeys', () => {
  it('moves keys, keeps an existing new value, and sets the marker', () => {
    const { map, store } = memoryStore({
      auramind_theme: 'dark',
      auramind_ci_tour_step: '3',
      auramind_dailyGoal: '10',
      bonamind_dailyGoal: '25',
      'auramind.aurachat.sessions.v1': '[{"id":"s1"}]',
      unrelated: 'x',
    });
    const report = migrateLegacyKeys(store);
    expect(map.get('bonamind_theme')).toBe('dark');
    expect(map.get('bonamind_ci_tour_step')).toBe('3');
    expect(map.get('bonamind_dailyGoal')).toBe('25');
    expect(map.get('bonamind.aurachat.sessions.v1')).toBe('[{"id":"s1"}]');
    expect([...map.keys()].filter((k) => k.startsWith('auramind'))).toEqual([]);
    expect(map.get('unrelated')).toBe('x');
    expect(map.get(MIGRATION_MARKER)).toBe('1');
    expect(report.moved).toContain('auramind_theme');
    expect(report.dropped).toEqual(['auramind_dailyGoal']);
    expect(report.failed).toEqual([]);
  });

  it('does nothing on a second run once the marker is set', () => {
    const { map, store } = memoryStore({ auramind_theme: 'dark' });
    migrateLegacyKeys(store);
    map.set('auramind_x', 'late');
    const report = migrateLegacyKeys(store);
    expect(report.skipped).toBe(true);
    expect(map.get('auramind_x')).toBe('late');
    expect(map.has('bonamind_x')).toBe(false);
  });

  it('restores the old key when writing the new one throws, and leaves the marker unset', () => {
    const { map, store } = memoryStore({ auramind_big: 'payload', auramind_theme: 'dark' }, { failSet: 'bonamind_big' });
    const report = migrateLegacyKeys(store);
    expect(map.get('auramind_big')).toBe('payload');
    expect(report.failed).toEqual(['auramind_big']);
    expect(map.get('bonamind_theme')).toBe('dark');
    expect(map.has(MIGRATION_MARKER)).toBe(false);
  });

  it('keeps going when one key throws on read', () => {
    const { map, store } = memoryStore({ auramind_bad: '?', auramind_theme: 'dark' }, { failGet: 'auramind_bad' });
    const report = migrateLegacyKeys(store);
    expect(report.failed).toEqual(['auramind_bad']);
    expect(map.get('auramind_bad')).toBe('?');
    expect(map.get('bonamind_theme')).toBe('dark');
    expect(map.has(MIGRATION_MARKER)).toBe(false);
  });
});

describe('migrateLegacyKeysAsync', () => {
  it('migrates Capacitor Preferences the same way', async () => {
    const map = new Map<string, string>([['auramind_widget_due', '7'], ['bonamind_widget_deck', 'Bio']]);
    const prefs = {
      keys: async () => ({ keys: [...map.keys()] }),
      get: async ({ key }: { key: string }) => ({ value: map.has(key) ? map.get(key)! : null }),
      set: async ({ key, value }: { key: string; value: string }) => {
        map.set(key, value);
      },
      remove: async ({ key }: { key: string }) => {
        map.delete(key);
      },
    };
    const report = await migrateLegacyKeysAsync(preferencesStore(prefs));
    expect(map.get('bonamind_widget_due')).toBe('7');
    expect(map.has('auramind_widget_due')).toBe(false);
    expect(map.get('bonamind_widget_deck')).toBe('Bio');
    expect(map.get(MIGRATION_MARKER)).toBe('1');
    expect(report.moved).toEqual(['auramind_widget_due']);
  });
});

it('runs before every other module', () => {
  const src = readFileSync(resolve(__dirname, '../index.tsx'), 'utf8');
  expect(src.match(/^import\s+[^;]*?['"]([^'"]+)['"]/m)?.[1]).toBe('./lib/storageMigration/runFirst');
});
