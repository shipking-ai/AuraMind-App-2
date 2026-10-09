import type { OutboxItem, OutboxStore } from '@bonamind/core';
import type { BonaDb } from './db';

type Row = { payload: string };

/** The core outbox's storage contract, on the device database. */
export function createSqliteOutboxStore(db: BonaDb): OutboxStore {
  const write = (item: OutboxItem) =>
    db.runAsync(
      'INSERT OR REPLACE INTO outbox (id, user_id, kind, reviewed_at, attempts, payload) VALUES (?, ?, ?, ?, ?, ?)',
      [item.id, item.userId, item.kind, item.reviewedAt, item.attempts, JSON.stringify(item)],
    );
  return {
    async add(item) { await write(item); },
    async update(item) { await write(item); },
    async list(userId) {
      const rows = await db.getAllAsync<Row>('SELECT payload FROM outbox WHERE user_id = ? ORDER BY reviewed_at, id', [userId]);
      return rows.map((r) => JSON.parse(r.payload) as OutboxItem);
    },
    async remove(id) { await db.runAsync('DELETE FROM outbox WHERE id = ?', [id]); },
    async moveToDeadLetter(item, reason) {
      await db.runAsync('INSERT OR REPLACE INTO dead_letter (id, user_id, payload, reason, at) VALUES (?, ?, ?, ?, ?)', [
        item.id, item.userId, JSON.stringify(item), reason, Date.now(),
      ]);
      await db.runAsync('DELETE FROM outbox WHERE id = ?', [item.id]);
    },
    async clearOtherUsers(userId) {
      const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox WHERE user_id <> ?', [userId]);
      await db.runAsync('DELETE FROM outbox WHERE user_id <> ?', [userId]);
      return Number(row?.n ?? 0);
    },
  };
}
