/**
 * Marketplace: listing and forking go through server RPCs.
 *
 * Forking used to read the source deck's cards from the client (which cards
 * RLS forbids, so zero cards were copied) and selected a `cards.image` column
 * that does not exist (so it errored first). Browsing returned hard-coded demo
 * decks whenever the query came back empty or failed. These tests pin the
 * replacement: fork_public_deck / list_public_decks RPCs, and real errors.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const rpc = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());

vi.mock('../services/database/supabase', () => ({
  supabase: { rpc, from },
}));

import {
  forkPublicDeck,
  listPublicDecks,
  mapPublicDeckRow,
} from '../services/decks/marketplaceService';

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
});

const ROW = {
  id: 'd1',
  name: 'Spanish A1',
  description: 'Survival phrases',
  marketplace_category: 'Languages',
  marketplace_tags: ['spanish'],
  fork_count: 3,
  published_at: '2026-09-20T00:00:00Z',
  card_count: '42', // bigint arrives as a string
  creator_first_name: ' Ana ',
  is_mine: false,
};

describe('mapPublicDeckRow', () => {
  it('maps the RPC row, parsing the bigint card count', () => {
    expect(mapPublicDeckRow(ROW)).toEqual({
      id: 'd1',
      title: 'Spanish A1',
      description: 'Survival phrases',
      category: 'Languages',
      tags: ['spanish'],
      forkCount: 3,
      publishedAt: '2026-09-20T00:00:00Z',
      cardCount: 42,
      creatorFirstName: 'Ana',
      isMine: false,
    });
  });

  it('tolerates nulls from decks created before the marketplace columns', () => {
    const d = mapPublicDeckRow({
      ...ROW,
      marketplace_tags: null,
      fork_count: null,
      card_count: null,
      creator_first_name: '  ',
      is_mine: null,
    });
    expect(d.tags).toEqual([]);
    expect(d.forkCount).toBe(0);
    expect(d.cardCount).toBe(0);
    expect(d.creatorFirstName).toBeNull();
    expect(d.isMine).toBe(false);
  });
});

describe('listPublicDecks', () => {
  it('calls list_public_decks with trimmed filters and never reads tables directly', async () => {
    rpc.mockResolvedValue({ data: [ROW], error: null });

    const decks = await listPublicDecks({ search: '  spanish ', category: 'Languages', sort: 'newest' });

    expect(rpc).toHaveBeenCalledWith('list_public_decks', {
      p_search: 'spanish',
      p_category: 'Languages',
      p_sort: 'newest',
      p_limit: 30,
    });
    expect(from).not.toHaveBeenCalled();
    expect(decks).toHaveLength(1);
  });

  it('returns an empty list when nothing is published — no demo decks', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(listPublicDecks()).resolves.toEqual([]);
  });

  it('throws on error so the UI can show it, instead of fake data', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(listPublicDecks()).rejects.toEqual({ message: 'boom' });
  });
});

describe('forkPublicDeck', () => {
  it('forks through fork_public_deck and returns the new deck id', async () => {
    rpc.mockResolvedValue({ data: 'new-deck', error: null });

    await expect(forkPublicDeck('d1')).resolves.toBe('new-deck');
    expect(rpc).toHaveBeenCalledWith('fork_public_deck', { p_deck_id: 'd1' });
    // The old client-side copy read and wrote cards directly.
    expect(from).not.toHaveBeenCalled();
  });

  it('surfaces server errors (e.g. deck no longer public)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'deck not found or not public' } });
    await expect(forkPublicDeck('d1')).rejects.toEqual({ message: 'deck not found or not public' });
  });
});

describe('marketplace migration', () => {
  const sql = fs.readFileSync(
    path.resolve(__dirname, '../../../supabase/migrations/20260929_marketplace_fork_and_listing.sql'),
    'utf-8',
  );

  const fnBody = (name: string) => {
    const m = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`));
    expect(m, `${name} must be defined`).not.toBeNull();
    return m![0];
  };

  it('defines both RPCs as SECURITY DEFINER with a pinned search_path', () => {
    for (const name of ['fork_public_deck', 'list_public_decks', 'bump_forks_and_unpublish']) {
      const body = fnBody(name);
      expect(body).toMatch(/SECURITY DEFINER/);
      expect(body).toMatch(/SET search_path = public, pg_temp/);
    }
  });

  it('keeps every RPC away from anon', () => {
    for (const sig of [
      'fork_public_deck\\(uuid\\)',
      'list_public_decks\\(text, text, text, integer\\)',
      'bump_forks_and_unpublish\\(uuid, boolean\\)',
    ]) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${sig} FROM PUBLIC, anon;`));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${sig} TO authenticated;`));
    }
  });

  it('forks only public decks, into rows the caller owns', () => {
    const body = fnBody('fork_public_deck');
    expect(body).toMatch(/WHERE id = p_deck_id AND is_public = true/);
    expect(body).toMatch(/INSERT INTO public\.decks \(user_id,[\s\S]*?VALUES \(\s*v_uid,/);
    expect(body).toMatch(/INSERT INTO public\.cards \(deck_id, user_id,[\s\S]*?SELECT v_new_deck, v_uid,/);
    expect(body).not.toMatch(/\bimage\b/);
  });

  it('counts a fork once per user and never for your own deck', () => {
    const body = fnBody('fork_public_deck');
    expect(body).toMatch(/IF NOT v_forked_before AND v_src\.user_id <> v_uid THEN/);
  });

  it('lists only public decks and exposes the creator first name, not email or full name', () => {
    const body = fnBody('list_public_decks');
    expect(body).toMatch(/WHERE d\.is_public = true/);
    expect(body).toMatch(/split_part\(btrim\(p\.full_name\), ' ', 1\)/);
    expect(body).not.toMatch(/\bemail\b/);
  });

  it('turns the bare fork_count bump into a no-op', () => {
    const body = fnBody('bump_forks_and_unpublish');
    expect(body).toMatch(/IF NOT p_unpublish THEN\s+RETURN;/);
    expect(body).not.toMatch(/SET\s+fork_count/i);
  });
});
