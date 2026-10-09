/**
 * The Supabase reads and writes the native app needs, against the same
 * tables, RPC and conflict rules the website uses. The client is injected.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Card, Deck, StudySession } from '../types';
import { type CardScheduleUpdate, type ReviewRecord, toCardScheduleRow } from '../review/planReview';
import { msToIso } from '../time';
import { mapCardRow, mapDeckRow, mapSessionRow } from './rows';

/**
 * A write the server will never accept, so retrying is pointless:
 * P0002 card gone, 42501 not the owner, 22000 invalid rating.
 */
export class PermanentSyncError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'PermanentSyncError';
  }
}

const PERMANENT_CODES = new Set(['P0002', '42501', '22000']);

function raise(error: { code?: string; message?: string }): never {
  const code = error.code ?? '';
  const message = error.message ?? 'Supabase request failed';
  if (PERMANENT_CODES.has(code)) throw new PermanentSyncError(code, message);
  throw Object.assign(new Error(message), { code });
}

export type NewStudySession = Omit<StudySession, 'userId'> & { id: string; deckId: string };

export interface BonaMindData {
  listDecks(userId: string): Promise<Deck[]>;
  listCards(userId: string): Promise<Card[]>;
  listStudySessions(userId: string): Promise<StudySession[]>;
  getDisplayName(userId: string): Promise<string | null>;
  pushReview(userId: string, record: ReviewRecord, update: CardScheduleUpdate): Promise<void>;
  pushStudySession(userId: string, s: NewStudySession): Promise<void>;
}

export function createBonaMindData(client: SupabaseClient): BonaMindData {
  return {
    async listDecks(userId) {
      const { data, error } = await client.from('decks').select('*').eq('user_id', userId).order('created_at', { ascending: true });
      if (error) raise(error);
      const rows = data ?? [];
      const counts: Record<string, number> = {};
      if (rows.length > 0) {
        const { data: cards, error: cardsError } = await client.from('cards').select('deck_id').in('deck_id', rows.map((d) => d.id));
        if (cardsError) raise(cardsError);
        for (const c of cards ?? []) counts[c.deck_id] = (counts[c.deck_id] ?? 0) + 1;
      }
      return rows.map((d) => mapDeckRow(d, counts[d.id] ?? 0));
    },

    async listCards(userId) {
      const { data, error } = await client.from('cards').select('*').eq('user_id', userId).order('id', { ascending: true });
      if (error) raise(error);
      return (data ?? []).map(mapCardRow);
    },

    async listStudySessions(userId) {
      const { data, error } = await client.from('study_sessions').select('*').eq('user_id', userId).order('started_at', { ascending: false });
      if (error) raise(error);
      return (data ?? []).map(mapSessionRow);
    },

    async getDisplayName(userId) {
      const { data, error } = await client.from('user_profiles').select('full_name').eq('user_id', userId).maybeSingle();
      if (error) raise(error);
      return (data as { full_name?: string | null } | null)?.full_name ?? null;
    },

    async pushReview(userId, record, update) {
      const reviewedAtIso = msToIso(record.reviewedAt);
      // The RPC is idempotent on (user_id, card_id, reviewed_at), so a replay
      // of the same queued review is a no-op.
      const { error: rpcError } = await client.rpc('record_card_review', {
        p_user_id: userId,
        p_card_id: record.cardId,
        p_rating: record.rating,
        p_srs_result: record.srsResult,
        p_srs_algorithm: 'fsrs',
        p_reviewed_at: reviewedAtIso,
      });
      if (rpcError) raise(rpcError);
      // Never overwrite a schedule the server got from a newer review.
      const { error } = await client
        .from('cards')
        .update(toCardScheduleRow(update))
        .eq('id', record.cardId)
        .or(`last_reviewed.is.null,last_reviewed.lt.${reviewedAtIso}`);
      if (error) raise(error);
    },

    async pushStudySession(userId, s) {
      const { error } = await client.from('study_sessions').upsert(
        {
          id: s.id,
          user_id: userId,
          deck_id: s.deckId,
          started_at: msToIso(s.startTime),
          ended_at: s.endTime === undefined ? null : msToIso(s.endTime),
          cards_studied: s.cardsStudied,
          correct_answers: s.correctAnswers,
          total_answers: s.totalAnswers,
          accuracy: s.accuracy,
          duration_ms: s.duration,
        },
        { onConflict: 'id', ignoreDuplicates: true },
      );
      if (error) raise(error);
    },
  };
}
