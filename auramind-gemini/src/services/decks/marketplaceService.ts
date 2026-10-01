/**
 * Deck Marketplace Service
 *
 * Publish a deck, browse published decks, and fork ("clone") one into your
 * own library.
 *
 * Browsing and forking go through SECURITY DEFINER RPCs
 * (supabase/migrations/20260929_marketplace_fork_and_listing.sql) rather than
 * table reads. Cards RLS only lets a user see cards in their own decks, so the
 * client cannot count or copy another user's cards itself — the server does
 * the copy, and the fork only ever produces rows the caller owns.
 */

import { supabase } from '../database/supabase';

export interface MarketplaceDeck {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  tags: string[];
  forkCount: number;
  publishedAt: string | null;
  cardCount: number;
  /** First name only; the listing never exposes email or full name. */
  creatorFirstName: string | null;
  isMine: boolean;
}

export type MarketplaceSort = 'popular' | 'newest';

export interface MarketplaceFilters {
  search?: string;
  category?: string;
  sort?: MarketplaceSort;
  limit?: number;
}

export const MARKETPLACE_CATEGORIES = [
  'Programming',
  'Languages',
  'Medicine',
  'Law',
  'Mathematics',
  'History',
  'Science',
  'Music',
  'Art',
  'Business',
  'Other',
] as const;

interface PublicDeckRow {
  id: string;
  name: string;
  description: string | null;
  marketplace_category: string | null;
  marketplace_tags: string[] | null;
  fork_count: number | null;
  published_at: string | null;
  card_count: number | string | null;
  creator_first_name: string | null;
  is_mine: boolean | null;
}

/** Map one list_public_decks row to the shape the UI uses. */
export function mapPublicDeckRow(row: PublicDeckRow): MarketplaceDeck {
  return {
    id: row.id,
    title: row.name,
    description: row.description,
    category: row.marketplace_category,
    tags: Array.isArray(row.marketplace_tags) ? row.marketplace_tags : [],
    forkCount: row.fork_count ?? 0,
    publishedAt: row.published_at,
    // bigint arrives as a string from PostgREST.
    cardCount: Number(row.card_count ?? 0) || 0,
    creatorFirstName: row.creator_first_name?.trim() || null,
    isMine: row.is_mine === true,
  };
}

/**
 * Published decks, most-forked first (or newest). Throws on failure so the
 * caller can show an error instead of an empty list that looks like "nothing
 * published yet".
 */
export async function listPublicDecks(filters: MarketplaceFilters = {}): Promise<MarketplaceDeck[]> {
  if (!supabase) throw new Error('Offline');
  const { data, error } = await supabase.rpc('list_public_decks', {
    p_search: filters.search?.trim() || null,
    p_category: filters.category || null,
    p_sort: filters.sort ?? 'popular',
    p_limit: filters.limit ?? 30,
  });
  if (error) throw error;
  return ((data ?? []) as PublicDeckRow[]).map(mapPublicDeckRow);
}

/**
 * Copy a published deck and its cards into the signed-in user's library.
 * Returns the new deck's id. fork_count is bumped by the server, once per
 * user.
 */
export async function forkPublicDeck(deckId: string): Promise<string> {
  if (!supabase) throw new Error('Offline');
  const { data, error } = await supabase.rpc('fork_public_deck', { p_deck_id: deckId });
  if (error) throw error;
  if (typeof data !== 'string' || !data) throw new Error('Fork did not return a deck');
  return data;
}

/** Publish a deck to the marketplace. */
export async function publishDeckToMarketplace(
  deckId: string,
  payload: {
    category: string;
    tags: string[];
    description: string;
  },
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Offline' };
  try {
    const { error } = await supabase
      .from('decks')
      .update({
        is_public: true,
        published_at: new Date().toISOString(),
        marketplace_category: payload.category,
        marketplace_tags: payload.tags,
        marketplace_description: payload.description,
      })
      .eq('id', deckId);

    if (error) throw error;
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Unknown error' };
  }
}

/** Unpublish a deck (owner-only, via SECURITY DEFINER RPC). */
export async function unpublishDeck(
  deckId: string,
): Promise<{ success: boolean; error?: string }> {
  if (!supabase) return { success: false, error: 'Offline' };
  try {
    const { error } = await supabase.rpc('bump_forks_and_unpublish', {
      p_deck_id: deckId,
      p_unpublish: true,
    });
    if (error) throw error;
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Unknown error' };
  }
}
