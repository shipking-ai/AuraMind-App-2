import * as Sentry from '@sentry/react-native';
import { createBonaMindData, createOutbox, type BonaMindData, type Outbox, type OutboxItem } from '@bonamind/core';
import { loadKv, openBonaDb } from './db';
import { createSqliteOutboxStore } from './sqliteOutboxStore';
import { getSupabase } from './supabase';
import { startSync } from './sync';

/** Reported without card text or ids: only what kind of write failed and why. */
function reportDeadLetter(item: OutboxItem, reason: string) {
  Sentry.captureMessage('outbox dead letter', { level: 'warning', extra: { kind: item.kind, reason, attempts: item.attempts } });
}

let data: BonaMindData | null = null;
let outbox: Outbox | null = null;

/** Opens the device database and wires the data layer. Runs once at launch. */
export async function initAppData(): Promise<void> {
  if (outbox) return;
  const db = await openBonaDb();
  await loadKv(db);
  data = createBonaMindData(getSupabase());
  outbox = createOutbox({
    store: createSqliteOutboxStore(db),
    data,
    onDeadLetter: reportDeadLetter,
    // The review RPC runs as the caller: never send for a user who isn't signed in.
    canSend: async (userId) => (await getSupabase().auth.getSession()).data.session?.user.id === userId,
  });
  startSync(outbox);
}

export function getData(): BonaMindData {
  if (!data) throw new Error('initAppData() has not run');
  return data;
}

export function getOutbox(): Outbox {
  if (!outbox) throw new Error('initAppData() has not run');
  return outbox;
}
