/**
 * Opens the offline study database, moving its records over from the
 * pre-rename database on the way. Queued reviews in here exist nowhere else
 * until they sync, so the move never deletes a database:
 *
 *   - Records merge into `bonamind-offline` by key. A record already there is
 *     newer and wins, so a second tab or a later launch never overwrites it.
 *   - A legacy record is removed only after its key is confirmed present in
 *     `bonamind-offline`. Anything written to the legacy database later (an
 *     old-bundle tab, a rolled-back deploy) stays there and moves on the next
 *     launch.
 *   - Neither database is ever deleted. A delete that another tab blocks stays
 *     queued, then removes the database whenever that tab closes, and makes
 *     every open behind it hang. An empty legacy database costs nothing.
 *   - Where the browser has Web Locks, tabs migrate one at a time.
 *   - If the copy fails, this session keeps using the legacy database (nothing
 *     was removed from it) and the next launch tries again.
 */
import { LEGACY_OFFLINE_DB } from '../../lib/legacyNames';

export const OFFLINE_DB_NAME = 'bonamind-offline';
export const OFFLINE_DB_VERSION = 1;

const STORES = ['decks', 'cards', 'syncQueue'] as const;

export function upgradeOfflineDb(db: IDBDatabase): void {
  // Decks store
  if (!db.objectStoreNames.contains('decks')) {
    const decksStore = db.createObjectStore('decks', { keyPath: 'id' });
    decksStore.createIndex('userId', 'userId', { unique: false });
  }

  // Cards store
  if (!db.objectStoreNames.contains('cards')) {
    const cardsStore = db.createObjectStore('cards', { keyPath: 'id' });
    cardsStore.createIndex('deckId', 'deckId', { unique: false });
    cardsStore.createIndex('userId', 'userId', { unique: false });
    cardsStore.createIndex('nextReview', 'nextReview', { unique: false });
  }

  // Sync queue store
  if (!db.objectStoreNames.contains('syncQueue')) {
    const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
    syncStore.createIndex('timestamp', 'timestamp', { unique: false });
    syncStore.createIndex('retryCount', 'retryCount', { unique: false });
  }
}

/** Copies records from `from` into `to`, skipping keys `to` already has. */
export type CopyStores = (from: IDBDatabase, to: IDBDatabase) => Promise<void>;

export type LocksLike = { request<T>(name: string, fn: () => Promise<T>): Promise<T> };

const MIGRATION_LOCK = 'bonamind-offline-migration';

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });

const keyOf = (store: IDBObjectStore, record: unknown) => (record as Record<string, IDBValidKey>)[store.keyPath as string];

export const copyAllStores: CopyStores = async (from, to) => {
  const read = from.transaction([...STORES], 'readonly');
  const records = await Promise.all(STORES.map((s) => request(read.objectStore(s).getAll())));
  const write = to.transaction([...STORES], 'readwrite');
  STORES.forEach((s, i) => {
    const store = write.objectStore(s);
    const existing = store.getAllKeys();
    existing.onsuccess = () => {
      const have = new Set(existing.result.map(String));
      for (const record of records[i]) {
        if (!have.has(String(keyOf(store, record)))) store.put(record);
      }
    };
  });
  await finished(write);
};

/** Removes from `legacy` every record whose key `current` now holds. */
async function drainCopied(legacy: IDBDatabase, current: IDBDatabase): Promise<void> {
  const check = current.transaction([...STORES], 'readonly');
  const present = await Promise.all(STORES.map((s) => request(check.objectStore(s).getAllKeys())));
  const drain = legacy.transaction([...STORES], 'readwrite');
  STORES.forEach((s, i) => {
    const store = drain.objectStore(s);
    const have = new Set(present[i].map(String));
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      for (const key of keys.result) if (have.has(String(key))) store.delete(key);
    };
  });
  await finished(drain);
}

function openCurrent(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(name, OFFLINE_DB_VERSION);
    req.onupgradeneeded = () => upgradeOfflineDb(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Opens the legacy database if it exists, without ever creating it. */
function openLegacyIfPresent(factory: IDBFactory): Promise<IDBDatabase | null> {
  return new Promise((resolve, reject) => {
    let absent = false;
    const req = factory.open(LEGACY_OFFLINE_DB);
    req.onupgradeneeded = (event) => {
      if (event.oldVersion === 0) {
        absent = true;
        req.transaction?.abort();
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = (event) => {
      if (absent) {
        event.preventDefault();
        resolve(null);
      } else {
        reject(req.error);
      }
    };
  });
}

async function migrateAndOpen(factory: IDBFactory, copy: CopyStores): Promise<IDBDatabase> {
  const current = await openCurrent(factory, OFFLINE_DB_NAME);
  const legacy = await openLegacyIfPresent(factory);
  if (!legacy) return current;
  try {
    await copy(legacy, current);
  } catch {
    current.close();
    return legacy;
  }
  try {
    await drainCopied(legacy, current);
  } catch {
    // Everything is already in `current`; leftovers drain on the next launch.
  }
  legacy.close();
  return current;
}

export async function openOfflineDb(
  factory: IDBFactory = indexedDB,
  copy: CopyStores = copyAllStores,
  locks: LocksLike | undefined = (globalThis.navigator as { locks?: LocksLike } | undefined)?.locks,
): Promise<IDBDatabase> {
  const run = () => migrateAndOpen(factory, copy);
  return locks ? locks.request(MIGRATION_LOCK, run) : run();
}
