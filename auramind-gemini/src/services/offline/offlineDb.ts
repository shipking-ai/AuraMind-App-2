/**
 * Opens the offline study database, moving it from its pre-rename name on the
 * way. Queued reviews in here exist nowhere else until they sync, so the move
 * is built so that a crash or failure at any point loses nothing:
 *
 *   - While the legacy database exists it is the source of truth. A
 *     `bonamind-offline` found next to it is a leftover from an unfinished
 *     try and is rebuilt from scratch.
 *   - The legacy database is deleted only after every store's record count
 *     matches in the copy.
 *   - If the copy fails, the half-made copy is thrown away and this session
 *     keeps using the legacy database; the next launch tries again.
 *   - If another tab blocks the delete, the verified copy is used; the delete
 *     finishes once that tab closes.
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

export type CopyStores = (from: IDBDatabase, to: IDBDatabase) => Promise<void>;

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/** Reads every record from `from`, then writes them all to `to` in one transaction. */
export const copyAllStores: CopyStores = async (from, to) => {
  const read = from.transaction([...STORES], 'readonly');
  const records = await Promise.all(STORES.map((s) => request(read.objectStore(s).getAll())));
  const write = to.transaction([...STORES], 'readwrite');
  STORES.forEach((s, i) => records[i].forEach((r) => write.objectStore(s).put(r)));
  await new Promise<void>((resolve, reject) => {
    write.oncomplete = () => resolve();
    write.onerror = () => reject(write.error);
    write.onabort = () => reject(write.error ?? new Error('copy aborted'));
  });
};

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

function deleteDb(factory: IDBFactory, name: string): Promise<'deleted' | 'blocked'> {
  return new Promise((resolve, reject) => {
    const req = factory.deleteDatabase(name);
    req.onsuccess = () => resolve('deleted');
    req.onblocked = () => resolve('blocked');
    req.onerror = () => reject(req.error);
  });
}

async function countsMatch(a: IDBDatabase, b: IDBDatabase): Promise<boolean> {
  for (const s of STORES) {
    const [left, right] = await Promise.all([
      request(a.transaction(s, 'readonly').objectStore(s).count()),
      request(b.transaction(s, 'readonly').objectStore(s).count()),
    ]);
    if (left !== right) return false;
  }
  return true;
}

export async function openOfflineDb(
  factory: IDBFactory = indexedDB,
  copy: CopyStores = copyAllStores,
): Promise<IDBDatabase> {
  const legacy = await openLegacyIfPresent(factory);
  if (!legacy) return openCurrent(factory, OFFLINE_DB_NAME);

  let fresh: IDBDatabase | null = null;
  try {
    if ((await deleteDb(factory, OFFLINE_DB_NAME)) === 'blocked') throw new Error('stale copy is in use');
    fresh = await openCurrent(factory, OFFLINE_DB_NAME);
    await copy(legacy, fresh);
    if (!(await countsMatch(legacy, fresh))) throw new Error('record counts differ');
  } catch {
    if (fresh) {
      fresh.close();
      await deleteDb(factory, OFFLINE_DB_NAME).catch(() => 'blocked');
    }
    return legacy;
  }

  legacy.close();
  // 'blocked' means another tab still has it open; the delete completes when
  // that tab closes, and the verified copy is already the source of truth.
  await deleteDb(factory, LEGACY_OFFLINE_DB).catch(() => 'blocked');
  return fresh;
}
