import type { Card, OutboxItem } from '@bonamind/core';

/**
 * A server refetch must not undo reviews still waiting in the outbox: apply
 * each queued schedule update on top of the fetched card, unless the server
 * already holds a newer review of that card.
 */
export function overlayPending(cards: Card[], pending: OutboxItem[]): Card[] {
  const latest = new Map<string, Extract<OutboxItem, { kind: 'review' }>>();
  for (const item of pending) {
    if (item.kind !== 'review') continue;
    const prev = latest.get(item.record.cardId);
    if (!prev || item.reviewedAt >= prev.reviewedAt) latest.set(item.record.cardId, item);
  }
  if (latest.size === 0) return cards;
  return cards.map((c) => {
    const q = latest.get(c.id);
    if (!q || (c.lastReviewed ?? 0) >= q.update.lastReviewed) return c;
    return { ...c, ...q.update };
  });
}
