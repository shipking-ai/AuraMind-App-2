import * as SQLite from 'expo-sqlite';

/**
 * The device database: a JSON snapshot cache (`kv`) that makes launch instant,
 * the review outbox, and a dead-letter table for writes the server refused.
 * The subset of expo-sqlite's async API used here, so tests can back it with
 * another SQLite engine.
 */
export interface BonaDb {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: unknown[]): Promise<unknown>;
  getAllAsync<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  getFirstAsync<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>;
}

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY NOT NULL, json TEXT NOT NULL, updated_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS outbox (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL,
     reviewed_at INTEGER NOT NULL, attempts INTEGER NOT NULL, payload TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS outbox_user_order ON outbox (user_id, reviewed_at, id);
   CREATE TABLE IF NOT EXISTS dead_letter (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, payload TEXT NOT NULL,
     reason TEXT NOT NULL, at INTEGER NOT NULL);`,
];

export async function migrate(db: BonaDb): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version', []);
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    await db.execAsync(MIGRATIONS[version]);
    version += 1;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}

export async function openBonaDb(): Promise<BonaDb> {
  const db = await SQLite.openDatabaseAsync('bonamind.db');
  await db.execAsync('PRAGMA journal_mode = WAL');
  const bona = db as unknown as BonaDb;
  await migrate(bona);
  return bona;
}

// ── kv snapshot cache ─────────────────────────────────────────────────────
// Loaded into memory once at startup so screens can render the last-known
// data synchronously on launch, then written through on every update.

const kvMemory = new Map<string, unknown>();
let kvDb: BonaDb | null = null;

export async function loadKv(db: BonaDb): Promise<void> {
  kvDb = db;
  const rows = await db.getAllAsync<{ key: string; json: string }>('SELECT key, json FROM kv', []);
  for (const r of rows) kvMemory.set(r.key, JSON.parse(r.json));
}

export function kvGet<T>(key: string): T | undefined {
  return kvMemory.get(key) as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  kvMemory.set(key, value);
  await kvDb?.runAsync('INSERT OR REPLACE INTO kv (key, json, updated_at) VALUES (?, ?, ?)', [key, JSON.stringify(value), Date.now()]);
}
