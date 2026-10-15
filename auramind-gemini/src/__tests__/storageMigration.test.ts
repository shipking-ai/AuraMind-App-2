import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MIGRATION_MARKER,
  legacyKeyTarget,
  migrateLegacyKeysAsync,
  preferencesStore,
} from '../lib/storageMigration/legacyKeys';

const CLASSIC_SCRIPT = readFileSync(resolve(__dirname, '../../public/storage-migrate.js'), 'utf8');

/**
 * A Map-backed localStorage; `failSet`/`failGet` make one key throw. Returns
 * the map and a function that runs public/storage-migrate.js against it.
 */
function memoryStorage(seed: Record<string, string>, opts: { failSet?: string; failGet?: string } = {}) {
  const map = new Map(Object.entries(seed));
  const localStorage = {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => {
      if (k === opts.failGet) throw new Error('read failed');
      return map.has(k) ? map.get(k)! : null;
    },
    setItem: (k: string, v: string) => {
      if (k === opts.failSet) throw new Error('QuotaExceededError');
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
  const run = () => new Function('window', CLASSIC_SCRIPT)({ localStorage });
  return { map, run };
}

describe('legacyKeyTarget', () => {
  it('maps each legacy separator and only the leading prefix', () => {
    expect(legacyKeyTarget('auramind_theme')).toBe('bonamind_theme'); // legacy-name: ok
    expect(legacyKeyTarget('auramind-saved-quizzes')).toBe('bonamind-saved-quizzes'); // legacy-name: ok
    expect(legacyKeyTarget('auramind.aurachat.sessions.v1')).toBe('bonamind.aurachat.sessions.v1'); // legacy-name: ok
    expect(legacyKeyTarget('auramind:quiz:auramind_x')).toBe('bonamind:quiz:auramind_x'); // legacy-name: ok
    expect(legacyKeyTarget('auramindtheme')).toBeNull(); // legacy-name: ok
    expect(legacyKeyTarget('bonamind_theme')).toBeNull();
    expect(legacyKeyTarget('other_auramind_x')).toBeNull(); // legacy-name: ok
  });
});

describe('storage-migrate.js (localStorage, before any module runs)', () => {
  it('moves keys, keeps an existing new value, and sets the marker', () => {
    const { map, run } = memoryStorage({
      auramind_theme: 'dark', // legacy-name: ok
      auramind_ci_tour_step: '3', // legacy-name: ok
      auramind_dailyGoal: '10', // legacy-name: ok
      bonamind_dailyGoal: '25',
      'auramind.aurachat.sessions.v1': '[{"id":"s1"}]', // legacy-name: ok
      'auramind:quiz:auramind_x': 'q', // legacy-name: ok
      unrelated: 'x',
    });
    run();
    expect(map.get('bonamind_theme')).toBe('dark');
    expect(map.get('bonamind_ci_tour_step')).toBe('3');
    expect(map.get('bonamind_dailyGoal')).toBe('25');
    expect(map.get('bonamind.aurachat.sessions.v1')).toBe('[{"id":"s1"}]');
    expect(map.get('bonamind:quiz:auramind_x')).toBe('q'); // legacy-name: ok
    expect([...map.keys()].filter((k) => k.startsWith('auramind'))).toEqual([]); // legacy-name: ok
    expect(map.get('unrelated')).toBe('x');
    expect(map.get(MIGRATION_MARKER)).toBe('1');
  });

  it('does nothing on a second run once the marker is set', () => {
    const { map, run } = memoryStorage({ auramind_theme: 'dark' }); // legacy-name: ok
    run();
    map.set('auramind_x', 'late'); // legacy-name: ok
    run();
    expect(map.get('auramind_x')).toBe('late'); // legacy-name: ok
    expect(map.has('bonamind_x')).toBe(false);
  });

  it('restores the old key when writing the new one throws, and leaves the marker unset', () => {
    const { map, run } = memoryStorage({ auramind_big: 'payload', auramind_theme: 'dark' }, { failSet: 'bonamind_big' }); // legacy-name: ok
    run();
    expect(map.get('auramind_big')).toBe('payload'); // legacy-name: ok
    expect(map.get('bonamind_theme')).toBe('dark');
    expect(map.has(MIGRATION_MARKER)).toBe(false);
  });

  it('keeps going when one key throws on read', () => {
    const { map, run } = memoryStorage({ auramind_bad: '?', auramind_theme: 'dark' }, { failGet: 'auramind_bad' }); // legacy-name: ok
    run();
    expect(map.get('auramind_bad')).toBe('?'); // legacy-name: ok
    expect(map.get('bonamind_theme')).toBe('dark');
    expect(map.has(MIGRATION_MARKER)).toBe(false);
  });

  it('never throws, even when localStorage itself is unavailable', () => {
    const blocked = {};
    Object.defineProperty(blocked, 'localStorage', { get: () => { throw new Error('SecurityError'); } });
    expect(() => new Function('window', CLASSIC_SCRIPT)(blocked)).not.toThrow();
  });

  it('uses the same marker and prefix rule as the async Preferences migration', () => {
    expect(CLASSIC_SCRIPT).toContain(`'${MIGRATION_MARKER}'`);
    for (const key of ['auramind_a', 'auramind-a', 'auramind.a', 'auramind:a', 'auramindx', 'x_auramind_a']) { // legacy-name: ok
      const { map, run } = memoryStorage({ [key]: 'v' });
      run();
      const target = legacyKeyTarget(key);
      expect(map.get(target ?? key)).toBe('v');
    }
  });
});

describe('migrateLegacyKeysAsync', () => {
  it('migrates Capacitor Preferences the same way', async () => {
    const map = new Map<string, string>([['auramind_widget_due', '7'], ['bonamind_widget_deck', 'Bio']]); // legacy-name: ok
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
    expect(map.has('auramind_widget_due')).toBe(false); // legacy-name: ok
    expect(map.get('bonamind_widget_deck')).toBe('Bio');
    expect(map.get(MIGRATION_MARKER)).toBe('1');
    expect(report.moved).toEqual(['auramind_widget_due']); // legacy-name: ok
  });
});

// A first import is not enough: the bundler hoists the entry's shared chunks
// above its own code. A classic (non-module) script in <head> runs while the
// page is still parsing, before every module script, in every build.
it('runs before every other script that could read storage', () => {
  const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]);
  expect(scripts[0]).toMatch(/^\s*src="\/storage-migrate\.js"\s*$/);
});
