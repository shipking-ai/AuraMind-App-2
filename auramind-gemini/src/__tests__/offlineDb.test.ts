import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { LEGACY_OFFLINE_DB } from '../lib/legacyNames';
import { OFFLINE_DB_NAME, copyAllStores, openOfflineDb, upgradeOfflineDb, type CopyStores } from '../services/offline/offlineDb';

type Seed = { decks?: number; cards?: number; syncQueue?: number };

function openRaw(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(name, 1);
    req.onupgradeneeded = () => upgradeOfflineDb(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function seed(factory: IDBFactory, name: string, counts: Seed, tag = 'legacy', keepOpen = false) {
  const db = await openRaw(factory, name);
  const tx = db.transaction(['decks', 'cards', 'syncQueue'], 'readwrite');
  for (let i = 0; i < (counts.decks ?? 0); i++) tx.objectStore('decks').put({ id: `${tag}-d${i}`, userId: 'u1' });
  for (let i = 0; i < (counts.cards ?? 0); i++) {
    tx.objectStore('cards').put({ id: `${tag}-c${i}`, deckId: 'd0', userId: 'u1', nextReview: i });
  }
  for (let i = 0; i < (counts.syncQueue ?? 0); i++) {
    tx.objectStore('syncQueue').put({ id: `${tag}-q${i}`, type: 'card_review', data: {}, timestamp: i, retryCount: 0 });
  }
  await done(tx);
  if (!keepOpen) db.close();
  return db;
}

async function putQueued(db: IDBDatabase, id: string, extra: Record<string, unknown> = {}) {
  const tx = db.transaction('syncQueue', 'readwrite');
  tx.objectStore('syncQueue').put({ id, type: 'card_review', data: {}, timestamp: 0, retryCount: 0, ...extra });
  await done(tx);
}

function count(db: IDBDatabase, store: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function getAll(db: IDBDatabase, store: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const ids = async (db: IDBDatabase, store: string) => (await getAll(db, store)).map((r) => r.id).sort();
const names = async (factory: IDBFactory) => (await factory.databases()).map((d) => d.name);

/** Fails the test instead of hanging the run when an open never settles. */
function within<T>(p: Promise<T>, ms = 2000): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`still pending after ${ms}ms`)), ms))]);
}

async function legacyCount(factory: IDBFactory, store: string) {
  const db = await openRaw(factory, LEGACY_OFFLINE_DB);
  const n = await count(db, store);
  db.close();
  return n;
}

describe('openOfflineDb', () => {
  it('creates bonamind-offline fresh when there is no legacy database', async () => {
    const factory = new IDBFactory();
    const db = await openOfflineDb(factory);
    expect(db.name).toBe(OFFLINE_DB_NAME);
    expect(OFFLINE_DB_NAME).toBe('bonamind-offline');
    expect(await names(factory)).not.toContain(LEGACY_OFFLINE_DB);
    db.close();
  });

  it('does not create auramind-offline while probing for it', async () => { // legacy-name: ok
    const factory = new IDBFactory();
    (await openOfflineDb(factory)).close();
    (await openOfflineDb(factory)).close();
    expect(await names(factory)).toEqual([OFFLINE_DB_NAME]);
  });

  it('copies every record, then empties the legacy database', async () => {
    const factory = new IDBFactory();
    await seed(factory, LEGACY_OFFLINE_DB, { decks: 2, cards: 3, syncQueue: 4 });
    const db = await openOfflineDb(factory);
    expect(db.name).toBe(OFFLINE_DB_NAME);
    expect([await count(db, 'decks'), await count(db, 'cards'), await count(db, 'syncQueue')]).toEqual([2, 3, 4]);
    db.close();
    expect(await legacyCount(factory, 'syncQueue')).toBe(0);
    expect(await legacyCount(factory, 'cards')).toBe(0);
  });

  it('keeps using the legacy database when the copy fails, and the next launch finishes', async () => {
    const factory = new IDBFactory();
    await seed(factory, LEGACY_OFFLINE_DB, { syncQueue: 4 });
    const failing: CopyStores = async () => {
      throw new Error('quota');
    };
    const db = await openOfflineDb(factory, failing);
    expect(db.name).toBe(LEGACY_OFFLINE_DB);
    expect(await count(db, 'syncQueue')).toBe(4);
    db.close();

    const retried = await openOfflineDb(factory);
    expect(retried.name).toBe(OFFLINE_DB_NAME);
    expect(await count(retried, 'syncQueue')).toBe(4);
    retried.close();
  });

  it('merges into an existing bonamind-offline and keeps its newer records', async () => {
    const factory = new IDBFactory();
    await seed(factory, LEGACY_OFFLINE_DB, { syncQueue: 2 });
    const current = await seed(factory, OFFLINE_DB_NAME, { syncQueue: 1 }, 'current', true);
    await putQueued(current, 'legacy-q0', { retryCount: 5 }); // the newer copy of a legacy record
    current.close();

    const db = await openOfflineDb(factory);
    expect(await ids(db, 'syncQueue')).toEqual(['current-q0', 'legacy-q0', 'legacy-q1']);
    expect((await getAll(db, 'syncQueue')).find((r) => r.id === 'legacy-q0').retryCount).toBe(5);
    db.close();
  });

  it('uses the copy while another tab holds the legacy database open', async () => {
    const factory = new IDBFactory();
    const otherTab = await seed(factory, LEGACY_OFFLINE_DB, { syncQueue: 4 }, 'legacy', true);
    const db = await within(openOfflineDb(factory));
    expect(db.name).toBe(OFFLINE_DB_NAME);
    expect(await count(db, 'syncQueue')).toBe(4);
    db.close();
    otherTab.close();
  });

  it('never hangs on a later open while an old tab still holds the legacy database', async () => {
    const factory = new IDBFactory();
    const otherTab = await seed(factory, LEGACY_OFFLINE_DB, { syncQueue: 4 }, 'legacy', true);
    (await within(openOfflineDb(factory))).close();
    const reopened = await within(openOfflineDb(factory));
    expect(await count(reopened, 'syncQueue')).toBe(4);
    reopened.close();
    otherTab.close();
  });

  it('moves reviews an old tab queued after the migration on the next launch', async () => {
    // Also the roll-back-then-forward case: the old bundle writes to the
    // legacy database again, and nothing written on either side may be lost.
    const factory = new IDBFactory();
    const otherTab = await seed(factory, LEGACY_OFFLINE_DB, { syncQueue: 2 }, 'legacy', true);
    const db = await openOfflineDb(factory);
    await putQueued(db, 'queued-after-migration');
    db.close();
    await putQueued(otherTab, 'queued-by-old-tab');
    otherTab.close();

    const next = await openOfflineDb(factory);
    expect(await ids(next, 'syncQueue')).toEqual(['legacy-q0', 'legacy-q1', 'queued-after-migration', 'queued-by-old-tab']);
    next.close();
  });

  it('loses nothing when two tabs migrate at the same moment', async () => {
    // A service-worker update reloads every open tab at once, so a second
    // tab starts while the first is mid-copy.
    const factory = new IDBFactory();
    await seed(factory, LEGACY_OFFLINE_DB, { cards: 50, syncQueue: 200 });
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const inCopy = new Promise<void>((r) => (entered = r));
    const pausedCopy: CopyStores = async (from, to) => {
      entered();
      await gate;
      return copyAllStores(from, to);
    };
    const tabA = openOfflineDb(factory, pausedCopy);
    await within(inCopy);
    const tabB = openOfflineDb(factory);
    await new Promise((r) => setTimeout(r, 20));
    release();
    const [a, b] = await within(Promise.all([tabA, tabB]), 5000);
    a.close();
    b.close();

    const next = await within(openOfflineDb(factory));
    expect(next.name).toBe(OFFLINE_DB_NAME);
    expect(await count(next, 'syncQueue')).toBe(200);
    expect(await count(next, 'cards')).toBe(50);
    next.close();
  });

  it('runs the migration under a cross-tab lock when one is available', async () => {
    const factory = new IDBFactory();
    await seed(factory, LEGACY_OFFLINE_DB, { syncQueue: 1 });
    const held: string[] = [];
    const locks = { request: async <T,>(name: string, fn: () => Promise<T>) => { held.push(name); return fn(); } };
    (await openOfflineDb(factory, undefined, locks)).close();
    expect(held).toEqual(['bonamind-offline-migration']);
  });
});
