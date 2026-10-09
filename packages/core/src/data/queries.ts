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

/**
 * A write that cannot go out right now for a reason retrying won't fix this
 * minute: no connection, or no valid session. The queue pauses without
 * spending attempts.
 */
export class PausedSyncError extends Error {
  constructor(public reason: 'offline' | 'auth', message: string) {
    super(message);
    this.name = 'PausedSyncError';
  }
}

// P0002 card gone · 22000 invalid rating · 23503 deck/card deleted (FK)
// 23502 missing column value · 22P02 malformed value.
const PERMANENT_CODES = new Set(['P0002', '22000', '23503', '23502', '22P02']);
const AUTH_CODES = new Set(['PGRST301', 'PGRST302', 'PGRST303', '401']);
// 42501 is permanent only when record_card_review itself refuses the write;
// a bare "permission denied" means the call went out as anon (no session).
const RPC_REFUSAL = /does not belong|not the rated user/i;

function raise(error: { code?: string; message?: string }): never {
  const code = error.code ?? '';
  const message = error.message ?? 'Supabase request failed';
  if (!code) throw new PausedSyncError('offline', message);
  if (AUTH_CODES.has(code)) throw new PausedSyncError('auth', message);
  if (code === '42501') {
    if (RPC_REFUSAL.test(message)) throw new PermanentSyncError(code, message);
    throw new PausedSyncError('auth', message);
  }
  if (PERMANENT_CODES.has(code)) throw new PermanentSyncError(code, message);
  throw Object.assign(new Error(message), { code });
}

/** The tuning gate the website applies before trusting fitted weights. */
export const FSRS_TUNING_GATE = 50;

export type NewStudySession = Omit<StudySession, 'userId'> & { id: string; deckId: string };

export interface BonaMindData {
  listDecks(userId: string): Promise<Deck[]>;
  listCards(userId: string): Promise<Card[]>;
  listStudySessions(userId: string): Promise<StudySession[]>;
  getDisplayName(userId: string): Promise<string | null>;
  getFsrsProfile(userId: string): Promise<{ weights?: number[]; profileLabel: string | null }>;
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

    async getFsrsProfile(userId) {
      const { data, error } = await client
        .from('user_fsrs_params')
        .select('weights, profile_label, review_count')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) raise(error);
      const row = data as { weights?: number[]; profile_label?: string | null; review_count?: number } | null;
      if (!row?.weights || (row.review_count ?? 0) < FSRS_TUNING_GATE) return { weights: undefined, profileLabel: null };
      return { weights: row.weights, profileLabel: row.profile_label ?? null };
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
