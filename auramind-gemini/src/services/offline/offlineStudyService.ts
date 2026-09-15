/**
 * Offline Study Service
 * 
 * Enables studying flashcards without an internet connection.
 * Uses IndexedDB for persistent local storage of decks and cards.
 * Syncs progress when connection is restored.
 */

import { Card, Deck } from '../../types';

const DB_NAME = 'auramind-offline';
const DB_VERSION = 1;
const DECKS_STORE = 'decks';
const CARDS_STORE = 'cards';
const SYNC_QUEUE_STORE = 'syncQueue';

interface SyncQueueItem {
  id: string;
  type: 'card_review' | 'card_create' | 'card_update' | 'card_delete';
  data: any;
  timestamp: number;
  retryCount: number;
}

interface _OfflineDB {
  decks: IDBObjectStore;
  cards: IDBObjectStore;
  syncQueue: IDBObjectStore;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Decks store
      if (!db.objectStoreNames.contains(DECKS_STORE)) {
        const decksStore = db.createObjectStore(DECKS_STORE, { keyPath: 'id' });
        decksStore.createIndex('userId', 'userId', { unique: false });
      }

      // Cards store
      if (!db.objectStoreNames.contains(CARDS_STORE)) {
        const cardsStore = db.createObjectStore(CARDS_STORE, { keyPath: 'id' });
        cardsStore.createIndex('deckId', 'deckId', { unique: false });
        cardsStore.createIndex('userId', 'userId', { unique: false });
        cardsStore.createIndex('nextReview', 'nextReview', { unique: false });
      }

      // Sync queue store
      if (!db.objectStoreNames.contains(SYNC_QUEUE_STORE)) {
        const syncStore = db.createObjectStore(SYNC_QUEUE_STORE, { keyPath: 'id' });
        syncStore.createIndex('timestamp', 'timestamp', { unique: false });
        syncStore.createIndex('retryCount', 'retryCount', { unique: false });
      }
    };
  });

  return dbPromise;
}

/**
 * Cache a deck and its cards for offline use
 */
export async function cacheDeckForOffline(userId: string, deck: Deck, cards: Card[]): Promise<void> {
  const db = await openDB();
  const tx = db.transaction([DECKS_STORE, CARDS_STORE], 'readwrite');

  // Store deck metadata
  const deckStore = tx.objectStore(DECKS_STORE);
  await deckStore.put({
    ...deck,
    userId,
    cachedAt: Date.now(),
  });

  // Store all cards
  const cardsStore = tx.objectStore(CARDS_STORE);
  for (const card of cards) {
    await cardsStore.put({
      ...card,
      userId,
      cachedAt: Date.now(),
    });
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get cached decks for offline use
 */
export async function getCachedDecks(userId: string): Promise<Deck[]> {
  const db = await openDB();
  const tx = db.transaction(DECKS_STORE, 'readonly');
  const store = tx.objectStore(DECKS_STORE);
  const index = store.index('userId');
  const request = index.getAll(userId);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get cached cards for a specific deck
 */
export async function getCachedCards(deckId: string): Promise<Card[]> {
  const db = await openDB();
  const tx = db.transaction(CARDS_STORE, 'readonly');
  const store = tx.objectStore(CARDS_STORE);
  const index = store.index('deckId');
  const request = index.getAll(deckId);

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get due cards from cached data
 */
export async function getDueCardsOffline(deckId: string): Promise<Card[]> {
  const cards = await getCachedCards(deckId);
  const now = Date.now();
  return cards.filter(card => (card.nextReview ?? 0) <= now);
}

/**
 * Queue a card review for sync when online
 */
export async function queueCardReview(cardId: string, rating: number, srsResult: any): Promise<void> {
  const db = await openDB();
  const tx = db.transaction([CARDS_STORE, SYNC_QUEUE_STORE], 'readwrite');

  // Update local card
  const cardsStore = tx.objectStore(CARDS_STORE);
  const cardRequest = cardsStore.get(cardId);

  cardRequest.onsuccess = () => {
    const card = cardRequest.result;
    if (card) {
      cardsStore.put({
        ...card,
        interval: srsResult.interval,
        easeFactor: srsResult.easeFactor,
        repetition: srsResult.repetition,
        nextReview: Date.now() + srsResult.interval * 86400000,
        lastReviewed: Date.now(),
        fsrsState: srsResult.fsrsState || card.fsrsState,
      });
    }
  };

  // Add to sync queue
  const syncStore = tx.objectStore(SYNC_QUEUE_STORE);
  await syncStore.put({
    id: `${cardId}_${Date.now()}`,
    type: 'card_review',
    data: { cardId, rating, srsResult },
    timestamp: Date.now(),
    retryCount: 0,
  });

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Get pending sync items
 */
export async function getPendingSyncItems(): Promise<SyncQueueItem[]> {
  const db = await openDB();
  const tx = db.transaction(SYNC_QUEUE_STORE, 'readonly');
  const store = tx.objectStore(SYNC_QUEUE_STORE);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear a sync item after successful sync
 */
export async function clearSyncItem(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(SYNC_QUEUE_STORE, 'readwrite');
  await tx.objectStore(SYNC_QUEUE_STORE).delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Clear all cached data for a user
 */
export async function clearOfflineCache(userId: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction([DECKS_STORE, CARDS_STORE, SYNC_QUEUE_STORE], 'readwrite');

  // Clear decks
  const decksStore = tx.objectStore(DECKS_STORE);
  const deckIndex = decksStore.index('userId');
  const deckRequest = deckIndex.openCursor(userId);

  deckRequest.onsuccess = (event) => {
    const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };

  // Clear cards
  const cardsStore = tx.objectStore(CARDS_STORE);
  const cardIndex = cardsStore.index('userId');
  const cardRequest = cardIndex.openCursor(userId);

  cardRequest.onsuccess = (event) => {
    const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
    }
  };

  // Clear sync queue
  await tx.objectStore(SYNC_QUEUE_STORE).clear();

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Sync all queued offline data to Supabase
 */
export async function syncOfflineData(): Promise<{ synced: number; failed: number }> {
  const items = await getPendingSyncItems();
  if (items.length === 0) return { synced: 0, failed: 0 };

  const { supabase } = await import('../database/supabase');
  let synced = 0;
  let failed = 0;

  for (const item of items) {
    try {
      if (item.type === 'card_review') {
        // Route through the SECURITY DEFINER `record_card_review` RPC
        // instead of a REST upsert. The RPC's authorization de-couples
        // JWT↔row coupling that the dropped 1-hour UPDATE policy used
        // to enforce; the offline queue can carry an item without
        // user_id (the RPC fills it in from auth.uid() server-side).
        //
        // Replay the ORIGINAL review timestamp: it is stable across
        // retries, so a re-flush after a partial failure hits the
        // (user_id, card_id, reviewed_at) idempotency key and no-ops
        // instead of duplicating the review.
        const { error } = await (supabase as any).rpc('record_card_review', {
          p_card_id: item.data.cardId,
          p_rating: item.data.rating,
          p_srs_result: item.data.srsResult ?? {},
          p_srs_algorithm: item.data.srsAlgorithm ?? 'fsrs',
          p_reviewed_at: new Date(item.timestamp ?? Date.now()).toISOString(),
          // p_user_id intentionally omitted — let server-side
          // auth.uid() populate the row owner.
        });
        if (error) throw error;
      }
      await clearSyncItem(item.id);
      synced++;
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}

/**
 * Check if app is online
 */
export function isOnline(): boolean {
  return navigator.onLine;
}

/**
 * Listen for online/offline events
 */
export function onConnectionChange(
  onOnline: () => void,
  onOffline: () => void
): () => void {
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);

  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}

/**
 * Get offline cache stats
 */
export async function getOfflineStats(): Promise<{
  decksCached: number;
  cardsCached: number;
  pendingSyncs: number;
  lastSync: number | null;
}> {
  const db = await openDB();

  // Count decks
  const deckTx = db.transaction(DECKS_STORE, 'readonly');
  const deckCountRequest = deckTx.objectStore(DECKS_STORE).count();
  const deckCount = await new Promise<number>((resolve, reject) => {
    deckCountRequest.onsuccess = () => resolve(deckCountRequest.result);
    deckCountRequest.onerror = () => reject(deckCountRequest.error);
  });

  // Count cards
  const cardTx = db.transaction(CARDS_STORE, 'readonly');
  const cardCountRequest = cardTx.objectStore(CARDS_STORE).count();
  const cardCount = await new Promise<number>((resolve, reject) => {
    cardCountRequest.onsuccess = () => resolve(cardCountRequest.result);
    cardCountRequest.onerror = () => reject(cardCountRequest.error);
  });

  // Count pending syncs
  const syncTx = db.transaction(SYNC_QUEUE_STORE, 'readonly');
  const syncCountRequest = syncTx.objectStore(SYNC_QUEUE_STORE).count();
  const syncCount = await new Promise<number>((resolve, reject) => {
    syncCountRequest.onsuccess = () => resolve(syncCountRequest.result);
    syncCountRequest.onerror = () => reject(syncCountRequest.error);
  });

  return {
    decksCached: deckCount,
    cardsCached: cardCount,
    pendingSyncs: syncCount,
    lastSync: null, // Could be stored in a separate metadata store
  };
}



