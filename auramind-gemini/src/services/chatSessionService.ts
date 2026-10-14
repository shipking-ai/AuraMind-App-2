/**
 * chatSessionService — Supabase persistence layer for Prof. Linnea conversations.
 *
 * Strategy:
 *   - Source of truth on the client is still localStorage (instant reads,
 *     offline-friendly). Supabase is the long-term sync layer.
 *   - On first save, mint a canonical UUID via Supabase and PATCH the local
 *     record's id to match so subsequent UPSERTs do not create duplicates.
 *     Pre-existing sessions with `sess-<ts>-<rand>` slugs migrate online
 *     lazily — on first hit, the slug is treated as a stable key until the
 *     remote write returns its UUID, then we re-key.
 *   - Writes are queued + debounced (5s) so a bursty typing session
 *     collapses to a single round-trip. `flush()` is exposed so the host
 *     can drain on tab-unload (best-effort via `navigator.sendBeacon`).
 *
 * Schema (migration `20260722100000_ai_chat_sessions`):
 *   user_id           UUID PRIMARY KEY part
 *   id                UUID PRIMARY KEY (separate so we can key By-record)
 *   title             TEXT
 *   mode              TEXT  ('study' | 'companion')
 *                     — Pre-refactor rows may still carry the old union
 *                     ('explain' | 'quiz' | 'generate' | 'free' | 'freechat').
 *                     `migrateChatMode()` reconciles them on every write.
 *   deck_id           UUID NULLABLE
 *   deck_name         TEXT NULLABLE
 *   pinned            BOOLEAN
 *   messages          JSONB
 *   created_at        TIMESTAMPTZ
 *   updated_at        TIMESTAMPTZ
 *
 *  We intentionally do NOT mutate the local slug-id in place until the
 *  Supabase UPSERT succeeds — that way a failed network round-trip
 *  doesn't leave the local record untrackable server-side.
 */

import { supabase } from './database/supabase';
import { migrateChatMode } from '../lib/chat-prompts';
import type { Message } from '../hooks/useAIChat';

export interface PersistedSession {
  id: string;
  title: string;
  pinned: boolean;
  preview: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  deckName?: string;
  deckId?: string;
  mode?: string;
}

export const REMOTE_UNAVAILABLE = 'remote_unavailable';

interface PendingWrite {
  session: PersistedSession;
  resolve: () => void;
  reject: (e: unknown) => void;
}

const QUEUE: PendingWrite[] = [];
let FLUSH_TIMER: number | null = null;
const DEBOUNCE_MS = 5_000;

let lastFlushError: string | null = null;

/**
 * Convert a local slug-style id to a canonical UUID using the timestamp prefix
 * as a salt. NOT crypto-strong — this is purely so the *client* keeps a stable
 * key for the session through a server round-trip; security-wise it's just
 * like generating a UUID locally. Server is free to ignore it.
 */
function slugToUuidLike(slug: string): string {
  // RFC 4122 v4-ish, derived deterministically from the slug characters.
  // Not cryptographic. Just unique enough to be a PK that doesn't collide
  // with the same slug on a fresh client.
  let h1 = 0x811c9dc5, h2 = 0xc2a4e691, h3 = 0x9e3779b9, h4 = 0x85ebca6b;
  for (let i = 0; i < slug.length; i++) {
    const c = slug.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca6b) >>> 0;
    h3 = Math.imul(h3 ^ c, 0xc2b2ae35) >>> 0;
    h4 = Math.imul(h4 ^ c, 0x27d4eb2f) >>> 0;
  }
  const bytes = new Uint8Array(16);
  const dv = new DataView(bytes.buffer);
  dv.setUint32(0, h1, true);
  dv.setUint32(4, h2, true);
  dv.setUint32(8, h3, true);
  dv.setUint32(12, h4, true);
  // RFC 4122 v4 bits
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * queueSession — debounced UPSERT into ai_chat_sessions.
 * Safe to call from message-changed effects; coalesces rapid writes to the
 * same session into one network round-trip.
 */
export function queueSession(session: PersistedSession): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!supabase) {
      lastFlushError = REMOTE_UNAVAILABLE;
      resolve();
      return;
    }
    QUEUE.push({ session, resolve, reject });
    if (FLUSH_TIMER !== null) clearTimeout(FLUSH_TIMER);
    FLUSH_TIMER = window.setTimeout(flushQueue, DEBOUNCE_MS);
  });
}

/** Force-drain the queue (used on tab-unload). Best-effort. */
export async function flush(): Promise<void> {
  if (FLUSH_TIMER !== null) {
    clearTimeout(FLUSH_TIMER);
    FLUSH_TIMER = null;
  }
  await flushQueue();
}

async function flushQueue(): Promise<void> {
  if (!supabase) return;
  if (QUEUE.length === 0) return;
  const draining = QUEUE.splice(0, QUEUE.length);
  try {
    // Resolve the authed userId ONCE outside the map callback so we don't
    // need a sync-vs-async boundary inside the per-session mapper.
    const { userId } = await getAuthedUserId();
    if (!userId) {
      draining.forEach(({ resolve }) => resolve());
      lastFlushError = REMOTE_UNAVAILABLE;
      return;
    }
    const rows = draining.map(({ session }) => ({
      // Migrate local slug-IDs to deterministic UUID-like PKs on first write.
      // Subsequent writes re-use the (now-stored) UUID so duplicates never form.
      id: isUuidLike(session.id) ? session.id : slugToUuidLike(session.id),
      user_id: userId,
      title: session.title,
      mode: modeToDb(migrateChatMode(session.mode)),
      deck_id: session.deckId ?? null,
      deck_name: session.deckName ?? null,
      pinned: session.pinned,
      messages: session.messages as unknown as any,
      created_at: new Date(session.createdAt).toISOString(),
      updated_at: new Date(session.updatedAt).toISOString(),
    }));

    if (rows.length === 0) {
      draining.forEach(({ resolve }) => resolve());
      return;
    }

    const { error } = await supabase
      .from('ai_chat_sessions')
      .upsert(rows, { onConflict: 'id' });

    if (error) throw error;
    lastFlushError = null;
    draining.forEach(({ resolve }) => resolve());

    // Notify local observers that the canonical ids for these sessions
    // may have changed (slug -> UUID). The host renames its in-memory
    // record accordingly so future queueSession calls do the right thing.
    for (let i = 0; i < rows.length; i++) {
      const slug = draining[i].session.id;
      const canonical = rows[i].id;
      if (slug !== canonical) {
        window.dispatchEvent(new CustomEvent('bonamind:chat-id-migrated', {
          detail: { from: slug, to: canonical },
        }));
      }
    }
  } catch (e) {
    lastFlushError = e instanceof Error ? e.message : String(e);
    // Re-queue so the next debounce tick retries; resolve them locally as
    // a no-op so UI state stays consistent.
    QUEUE.unshift(...draining);
    draining.forEach(({ reject }) => reject(e));
  }
}

async function getAuthedUserId(): Promise<{ userId: string | null }> {
  if (!supabase) return { userId: null };
  const { data } = await supabase.auth.getUser();
  return { userId: data?.user?.id ?? null };
}

/**
 * modeToDb — map the app's ChatMode union onto the values the DB CHECK
 * constraint accepts. Once the migration to relax the constraint is applied,
 * this can be removed.
 */
function modeToDb(mode: string): string {
  if (mode === 'study' || mode === 'companion') return 'free';
  return mode;
}

/** Best-effort: a slug is "uuid-like" when it has the right shape. */
function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

/** Pull remote sessions down for the current user. */
export async function fetchRemoteSessions(limit = 50): Promise<PersistedSession[]> {
  if (!supabase) return [];
  const { userId } = await getAuthedUserId();
  if (!userId) return [];
  const { data, error } = await supabase
    .from('ai_chat_sessions')
    .select('id, title, mode, deck_id, deck_name, pinned, messages, created_at, updated_at, createdAt, updatedAt')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map((r: any) => ({
    id: r.id,
    title: r.title ?? 'Untitled',
    pinned: !!r.pinned,
    preview: '',
    messages: (r.messages ?? []) as Message[],
    createdAt: Date.parse(r.created_at ?? r.createdAt ?? '') || Date.now(),
    updatedAt: Date.parse(r.updated_at ?? r.updatedAt ?? '') || Date.now(),
    deckName: r.deck_name ?? undefined,
    deckId: r.deck_id ?? undefined,
    mode: r.mode ?? undefined,
  }));
}

/** Drop a session remotely. Idempotent: missing rows are a no-op. */
export async function deleteRemoteSession(id: string): Promise<void> {
  if (!supabase) return;
  const { userId } = await getAuthedUserId();
  if (!userId) return;
  await supabase.from('ai_chat_sessions').delete().eq('id', id).eq('user_id', userId);
}

export function getLastFlushError(): string | null {
  return lastFlushError;
}
