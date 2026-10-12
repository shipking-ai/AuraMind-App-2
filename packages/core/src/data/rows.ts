/**
 * Database row → domain object mappers. They mirror the website's
 * cardService / deckService / sessionService read paths field for field.
 */
import type { Card, Deck, FSRSState, StudySession } from '../types';
import { isoToMs, isoToMsOrUndef } from '../time';

type Row = Record<string, any>;

function parseFsrsState(value: unknown): FSRSState | undefined {
  if (!value) return undefined;
  return (typeof value === 'string' ? JSON.parse(value) : value) as FSRSState;
}

export function mapCardRow(row: Row): Card {
  return {
    id: row.id,
    front: row.front,
    back: row.back,
    deckId: row.deck_id,
    image: row.image ?? undefined,
    nextReview: isoToMs(row.next_review, Date.now()),
    interval: row.interval || 0,
    easeFactor: row.ease_factor || 2.5,
    repetition: row.repetition || 0,
    lapses: row.lapses ?? undefined,
    understandingLevel: row.understanding_level ?? undefined,
    lastReviewed: isoToMsOrUndef(row.last_reviewed),
    sourceType: row.source_type ?? undefined,
    sourceLabel: row.source_label ?? undefined,
    citations: row.citations ?? undefined,
    trustScore: row.trust_score ?? undefined,
    verified: row.verified ?? undefined,
    fsrsState: parseFsrsState(row.fsrs_state),
  };
}

export function mapDeckRow(row: Row, cardCount: number): Deck {
  return {
    id: row.id,
    title: row.name,
    description: row.description,
    createdAt: isoToMs(row.created_at, Date.now()),
    cardCount,
    isSample: row.is_sample || false,
    sourceLabel: row.source_label ?? undefined,
  };
}

export function mapSessionRow(row: Row): StudySession {
  return {
    id: row.id,
    userId: row.user_id,
    deckId: row.deck_id,
    startTime: isoToMs(row.started_at, Date.now()),
    endTime: isoToMsOrUndef(row.ended_at),
    cardsStudied: row.cards_studied,
    correctAnswers: row.correct_answers,
    totalAnswers: row.total_answers,
    accuracy: row.accuracy,
    duration: row.duration_ms ?? row.duration,
  };
}
