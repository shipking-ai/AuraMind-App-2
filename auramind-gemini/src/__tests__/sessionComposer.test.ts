import { describe, expect, it } from 'vitest';
import {
  FIRST_GAP,
  MIN_QUEUE_SIZE,
  RESURFACE_RATIO,
  composeSessionQueue,
} from '../services/memory/sessionComposer';
import type { Card } from '../types';

// Fixed "now": 2026-09-20 12:00 local.
const NOW = new Date(2026, 8, 20, 12, 0, 0).getTime();
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

/** Stable rand (0.5) — deterministic middle-of-road jitter for every call. */
const RAND = () => 0.5;

function card(id: string, opts: { deckId: string; lastReviewed?: number; targetR?: number; stabilityDays?: number }): Card {
  const stabilityDays = opts.stabilityDays ?? 10;
  const target = opts.targetR ?? 0.8;
  const elapsedDays = opts.lastReviewed != null
    ? (NOW - opts.lastReviewed) / DAY
    : stabilityDays * (1 / target - 1);
  return {
    id,
    deckId: opts.deckId,
    front: `front ${id}`,
    back: `back ${id}`,
    interval: 14,
    easeFactor: 2.5,
    repetition: 3,
    lastReviewed: opts.lastReviewed ?? NOW - elapsedDays * DAY,
    fsrsState: {
      stability: stabilityDays,
      difficulty: 5,
      elapsedDays,
      scheduledDays: 14,
      repetitions: 3,
      lapses: 0,
      lastReview: opts.lastReviewed ?? NOW - elapsedDays * DAY,
    },
  } as Card;
}

/** N due-now cards all belonging to one deck. */
function dueBatch(n: number, deckId = 'current'): Card[] {
  return Array.from({ length: n }, (_, i) => card(`due-${i}`, { deckId, lastReviewed: NOW - 8 * DAY, targetR: 0.3 }));
}

describe('composeSessionQueue', () => {
  it('returns the due queue unchanged when it is below the minimum size', () => {
    const due = dueBatch(MIN_QUEUE_SIZE - 1);
    const other = card('far', { deckId: 'other', targetR: 0.8 });
    const { queue, resurfacedIds } = composeSessionQueue(due, [...due, other], { now: NOW, currentDeckId: 'current', rand: RAND });
    expect(queue.map((c) => c.id)).toEqual(due.map((c) => c.id));
    expect(resurfacedIds.size).toBe(0);
  });

  it('never resurfaces cards from the current deck', () => {
    const due = dueBatch(12);
    const sameDeck = card('sibling', { deckId: 'current', targetR: 0.8 });
    const { queue, resurfacedIds } = composeSessionQueue(due, [...due, sameDeck], { now: NOW, currentDeckId: 'current', rand: RAND });
    expect(resurfacedIds.has('sibling')).toBe(false);
    expect(queue.every((c) => c.deckId === 'current' || resurfacedIds.has(c.id))).toBe(true);
  });

  it('respects the resurface ratio cap', () => {
    const due = dueBatch(10);
    const others = Array.from({ length: 8 }, (_, i) => card(`far-${i}`, { deckId: `deck-${i}`, targetR: 0.75 }));
    const { queue, resurfacedIds } = composeSessionQueue(due, [...due, ...others], { now: NOW, currentDeckId: 'current', rand: RAND });
    expect(resurfacedIds.size).toBe(Math.floor(10 * RESURFACE_RATIO)); // 2
    expect(queue).toHaveLength(12);
  });

  it('only draws candidates from the spark band and the re-review floor', () => {
    const due = dueBatch(10);
    const inBand = card('in-band', { deckId: 'a', targetR: 0.7 });
    const tooFresh = card('too-fresh', { deckId: 'b', targetR: 0.8, lastReviewed: NOW - HOUR });
    const forgotten = card('forgotten', { deckId: 'c', targetR: 0.2 });
    const { resurfacedIds } = composeSessionQueue(due, [...due, inBand, tooFresh, forgotten], { now: NOW, currentDeckId: 'current', rand: RAND });
    expect(resurfacedIds).toEqual(new Set(['in-band']));
  });

  it('inserts resurfaced cards at expanding gaps', () => {
    const due = dueBatch(20);
    const others = Array.from({ length: 6 }, (_, i) => card(`far-${i}`, { deckId: `deck-${i}`, targetR: 0.75 }));
    const { queue } = composeSessionQueue(due, [...due, ...others], { now: NOW, currentDeckId: 'current', rand: RAND });

    const positions = queue
      .map((c, i) => (c.id.startsWith('far-') ? i : -1))
      .filter((i) => i >= 0);

    // First resurfaced card sits after the base gap of due cards (the base
    // scales with queue length, clamped to [2, FIRST_GAP]).
    expect(positions[0]).toBeGreaterThanOrEqual(2);
    expect(positions[0]).toBeLessThanOrEqual(FIRST_GAP);

    // Index gaps between consecutive resurfaced cards strictly grow
    // (gap_i = due-gap + 1 resurfaced slot, and due-gaps grow by GAP_GROWTH).
    const gaps: number[] = [];
    for (let i = 1; i < positions.length; i++) gaps.push(positions[i] - positions[i - 1]);
    for (let i = 1; i < gaps.length; i++) {
      expect(gaps[i]).toBeGreaterThan(gaps[i - 1]);
    }
  });

  it('drops leftover resurfaced cards when the due queue runs out first', () => {
    // 7 due → cap = 1. The single gap of 5 leaves 2 due cards after it, so the
    // resurfaced card is placed, but a second candidate would bunch the tail.
    const due = dueBatch(7);
    const others = Array.from({ length: 3 }, (_, i) => card(`far-${i}`, { deckId: `deck-${i}`, targetR: 0.75 }));
    const { queue, resurfacedIds } = composeSessionQueue(due, [...due, ...others], { now: NOW, currentDeckId: 'current', rand: RAND });
    expect(resurfacedIds.size).toBe(1);
    expect(queue).toHaveLength(8);
    // All due cards still present, in order.
    expect(queue.filter((c) => c.id.startsWith('due-')).map((c) => c.id)).toEqual(due.map((c) => c.id));
  });

  it('never places two resurfaced cards adjacent to each other', () => {
    const due = dueBatch(20);
    const others = Array.from({ length: 6 }, (_, i) => card(`far-${i}`, { deckId: `deck-${i}`, targetR: 0.75 }));
    const { queue } = composeSessionQueue(due, [...due, ...others], { now: NOW, currentDeckId: 'current', rand: RAND });
    for (let i = 1; i < queue.length; i++) {
      if (
        queue[i].id.startsWith('far-') &&
        queue[i - 1].id.startsWith('far-')
      ) {
        throw new Error(`adjacent resurfaced cards at ${i - 1}, ${i}`);
      }
    }
  });

  it('keeps the due cards in their relative order', () => {
    const due = dueBatch(12);
    const others = Array.from({ length: 4 }, (_, i) => card(`far-${i}`, { deckId: `deck-${i}`, targetR: 0.75 }));
    const { queue } = composeSessionQueue(due, [...due, ...others], { now: NOW, currentDeckId: 'current', rand: RAND });
    const dueInQueue = queue.filter((c) => c.id.startsWith('due-')).map((c) => c.id);
    expect(dueInQueue).toEqual(due.map((c) => c.id));
  });

  it('does not duplicate a card that is somehow both due and a candidate', () => {
    const due = dueBatch(10);
    const interloper = card('due-3', { deckId: 'elsewhere', targetR: 0.8 });
    const { queue } = composeSessionQueue(due, [...due, interloper], { now: NOW, currentDeckId: 'current', rand: RAND });
    const ids = queue.map((c) => c.id);
    expect(ids.filter((id) => id === 'due-3')).toHaveLength(1);
  });
});
