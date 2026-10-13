import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { LEGACY_OFFLINE_DB } from '../lib/legacyNames';
import { OFFLINE_DB_NAME, openOfflineDb, upgradeOfflineDb, type CopyStores } from '../services/offline/offlineDb';

type Seed = { decks?: number; cards?: number; syncQueue?: number };

function openRaw(factory: IDBFactory, name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(name, 1);
    req.onupgradeneeded = () => upgradeOfflineDb(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  if (!keepOpen) db.close();
  return db;
}

function count(db: IDBDatabase, store: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function keys(db: IDBDatabase, store: string): Promise<IDBValidKey[]> {
  return new Promise((resolve, reject) => {
    const req = db.transaction(store, 'readonly').objectStore(store).getAllKeys();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const names = async (factory: IDBFactory) => (await factory.databases()).map((d) => d.name);

describe('openOfflineDb', () => {
  it('creates bonamind-offline fresh when there is no legacy database', async () => {
    const factory = new IDBFactory();
    const db = await openOfflineDb(factory);
    expect(db.name).toBe(OFFLINE_DB_NAME);
    expect(OFFLINE_DB_NAME).toBe('bonamind-offline');
    expect(await names(factory)).not.toContain(LEGACY_OFFLINE_DB);
    db.close();
  });

  it('does not create auramind-offline while probing for it', async () => {
    const factory = new IDBFactory();
    (await openOfflineDb(factory)).close();
    (await openOfflineDb(factory)).close();
    expect(await names(factory)).toEqual([OFFLINE_DB_NAME]);
  });

  it('copies every record, then deletes the legacy database', async () => {
    const factory = new IDBFactory();
    await seed(factory, LEGACY_OFFLINE_DB, { decks: 2, cards: 3, syncQueue: 4 });
    const db = await openOfflineDb(factory);
    expect(db.name).toBe(OFFLINE_DB_NAME);
    expect([await count(db, 'decks'), await count(db, 'cards'), await count(db, 'syncQueue')]).toEqual([2, 3, 4]);
    expect(await names(factory)).not.toContain(LEGACY_OFFLINE_DB);
    db.close();
  });

  it('keeps using the legacy database when the copy fails, and throws the half-made copy away', async () => {
    const factory = new IDBFactory();
    await seed(factory, LEGACY_OFFLINE_DB, { syncQueue: 4 });
    const failing: CopyStores = async () => {
      throw new Error('quota');
    };
    const db = await openOfflineDb(factory, failing);
    expect(db.name).toBe(LEGACY_OFFLINE_DB);
    expect(await count(db, 'syncQueue')).toBe(4);
    expect(await names(factory)).not.toContain(OFFLINE_DB_NAME);
    db.close();

    const retried = await openOfflineDb(factory);
    expect(retried.name).toBe(OFFLINE_DB_NAME);
    expect(await count(retried, 'syncQueue')).toBe(4);
    retried.close();
  });

  it('rebuilds a stale bonamind-offline left by an earlier try while the legacy one exists', async () => {
    const factory = new IDBFactory();
    await seed(factory, LEGACY_OFFLINE_DB, { syncQueue: 4 });
    await seed(factory, OFFLINE_DB_NAME, { syncQueue: 1 }, 'stray');
    const db = await openOfflineDb(factory);
    expect(db.name).toBe(OFFLINE_DB_NAME);
    expect((await keys(db, 'syncQueue')).sort()).toEqual(['legacy-q0', 'legacy-q1', 'legacy-q2', 'legacy-q3']);
    db.close();
  });

  it('uses the verified copy when another tab blocks the legacy delete', async () => {
    const factory = new IDBFactory();
    const otherTab = await seed(factory, LEGACY_OFFLINE_DB, { syncQueue: 4 }, 'legacy', true);
    const db = await openOfflineDb(factory);
    expect(db.name).toBe(OFFLINE_DB_NAME);
    expect(await count(db, 'syncQueue')).toBe(4);
    db.close();
    otherTab.close();
  });
});
