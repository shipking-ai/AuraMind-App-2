/**
 * The Capacitor Preferences half of the storage migration: moves values from
 * their pre-rename keys (LEGACY_PREFIX followed by `_`, `-`, `.` or `:`) to the
 * same key under `bonamind`. localStorage is moved earlier, before any module
 * runs, by the classic script public/storage-migrate.js, which follows the
 * same rules:
 *   - the new key already exists: it wins, and the old key is removed;
 *   - otherwise: read, remove the old key (freeing space on a full store),
 *     write the new key, and put the old value back if that write fails.
 * The run-once marker is only set when every key moved, so a failure is
 * retried on the next launch rather than leaving data behind.
 */
import { LEGACY_PREFIX } from '../legacyNames';

export const MIGRATION_MARKER = 'bonamind_storage_migrated_v1';

const NEW_PREFIX = 'bonamind';
const LEGACY_KEY = new RegExp(`^${LEGACY_PREFIX}([_\\-.:])`);

export interface AsyncKeyStore {
  keys(): Promise<string[]>;
  get(k: string): Promise<string | null>;
  set(k: string, v: string): Promise<void>;
  remove(k: string): Promise<void>;
}

export type MigrationReport = { skipped: boolean; moved: string[]; dropped: string[]; failed: string[] };

/** The post-rename key for a legacy key, or null when the key isn't legacy. */
export function legacyKeyTarget(key: string): string | null {
  return LEGACY_KEY.test(key) ? NEW_PREFIX + key.slice(LEGACY_PREFIX.length) : null;
}

const emptyReport = (): MigrationReport => ({ skipped: false, moved: [], dropped: [], failed: [] });

export async function migrateLegacyKeysAsync(store: AsyncKeyStore): Promise<MigrationReport> {
  const report = emptyReport();
  if ((await store.get(MIGRATION_MARKER)) !== null) return { ...report, skipped: true };
  for (const oldKey of await store.keys()) {
    const newKey = legacyKeyTarget(oldKey);
    if (!newKey) continue;
    let value: string | null = null;
    try {
      if ((await store.get(newKey)) !== null) {
        await store.remove(oldKey);
        report.dropped.push(oldKey);
        continue;
      }
      value = await store.get(oldKey);
      if (value === null) continue;
      await store.remove(oldKey);
      await store.set(newKey, value);
      report.moved.push(oldKey);
    } catch {
      report.failed.push(oldKey);
      if (value !== null) {
        try {
          if ((await store.get(oldKey)) === null) await store.set(oldKey, value);
        } catch {
          // Nothing more to try; the value is still in `value` only for this run.
        }
      }
    }
  }
  if (report.failed.length === 0) await store.set(MIGRATION_MARKER, '1');
  return report;
}

type PreferencesLike = {
  keys(): Promise<{ keys: string[] }>;
  get(o: { key: string }): Promise<{ value: string | null }>;
  set(o: { key: string; value: string }): Promise<void>;
  remove(o: { key: string }): Promise<void>;
};

export function preferencesStore(p: PreferencesLike): AsyncKeyStore {
  return {
    keys: async () => (await p.keys()).keys,
    get: async (key) => (await p.get({ key })).value,
    set: (key, value) => p.set({ key, value }),
    remove: (key) => p.remove({ key }),
  };
}
