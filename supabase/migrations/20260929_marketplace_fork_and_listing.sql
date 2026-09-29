-- Marketplace: fork on the server, list with real card counts.
--
-- Forking was broken three ways:
--   1. marketplaceService.forkDeck selected `cards.image`, which does not
--      exist, so every fork errored.
--   2. Even without that, it read the SOURCE deck's cards from the client,
--      and no RLS policy lets a user read cards in someone else's deck — so a
--      fork would have copied zero cards.
--   3. fork_count was bumped by a separate client call to
--      bump_forks_and_unpublish(deck, false), which any signed-in user could
--      call in a loop without forking anything.
--
-- fork_public_deck() does the whole fork in one SECURITY DEFINER statement:
-- it checks the source is public, creates the caller's copy, copies the
-- cards server-side, and bumps fork_count once per user (a second fork by the
-- same user, or a fork of your own deck, does not count). cards RLS stays
-- "owner of card AND deck" — nobody gains read access to another user's
-- cards; a fork only ever produces rows the caller owns.
--
-- list_public_decks() backs the Community tab. The client cannot count
-- cards in other users' decks (RLS) or read other users' profiles, so the
-- listing returns exactly what the tab shows: deck metadata, a card count,
-- and the creator's FIRST name only (never email or full name).
--
-- bump_forks_and_unpublish keeps its signature and the owner-only unpublish
-- path; its bare "bump" path becomes a no-op so fork_count only moves
-- through a real fork.
--
-- Idempotent: CREATE OR REPLACE + REVOKE/GRANT.

-- ── fork_public_deck ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fork_public_deck(p_deck_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_src         public.decks%ROWTYPE;
  v_new_deck    uuid;
  v_forked_before boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sign in to fork a deck' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_src FROM public.decks WHERE id = p_deck_id AND is_public = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'deck not found or not public' USING ERRCODE = 'P0002';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.decks WHERE user_id = v_uid AND original_deck_id = p_deck_id
  ) INTO v_forked_before;

  INSERT INTO public.decks (user_id, name, description, original_deck_id, is_public)
  VALUES (
    v_uid,
    v_src.name,
    COALESCE(NULLIF(v_src.marketplace_description, ''), v_src.description),
    p_deck_id,
    false
  )
  RETURNING id INTO v_new_deck;

  -- Fresh scheduling for the new owner: due now, no review history.
  INSERT INTO public.cards (deck_id, user_id, front, back, source_type, next_review)
  SELECT v_new_deck, v_uid, c.front, c.back, c.source_type, now()
  FROM public.cards c
  WHERE c.deck_id = p_deck_id
  ORDER BY c.created_at;

  IF NOT v_forked_before AND v_src.user_id <> v_uid THEN
    UPDATE public.decks SET fork_count = COALESCE(fork_count, 0) + 1 WHERE id = p_deck_id;
  END IF;

  RETURN v_new_deck;
END;
$$;

REVOKE ALL ON FUNCTION public.fork_public_deck(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fork_public_deck(uuid) TO authenticated;

-- ── list_public_decks ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_public_decks(
  p_search   text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_sort     text DEFAULT 'popular',
  p_limit    integer DEFAULT 30
)
RETURNS TABLE (
  id                   uuid,
  name                 text,
  description          text,
  marketplace_category text,
  marketplace_tags     text[],
  fork_count           integer,
  published_at         timestamptz,
  card_count           bigint,
  creator_first_name   text,
  is_mine              boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    d.id,
    d.name,
    COALESCE(NULLIF(d.marketplace_description, ''), d.description),
    d.marketplace_category,
    COALESCE(d.marketplace_tags, '{}'::text[]),
    COALESCE(d.fork_count, 0),
    d.published_at,
    (SELECT count(*) FROM public.cards c WHERE c.deck_id = d.id),
    NULLIF(split_part(btrim(p.full_name), ' ', 1), ''),
    d.user_id = auth.uid()
  FROM public.decks d
  LEFT JOIN public.user_profiles p ON p.user_id = d.user_id
  WHERE d.is_public = true
    AND auth.uid() IS NOT NULL
    AND (
      NULLIF(btrim(p_search), '') IS NULL
      OR d.name ILIKE '%' || btrim(p_search) || '%'
      OR COALESCE(d.marketplace_description, d.description, '') ILIKE '%' || btrim(p_search) || '%'
    )
    AND (NULLIF(p_category, '') IS NULL OR d.marketplace_category = p_category)
  ORDER BY
    CASE WHEN p_sort = 'newest' THEN d.published_at END DESC NULLS LAST,
    COALESCE(d.fork_count, 0) DESC,
    d.published_at DESC NULLS LAST
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.list_public_decks(text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_public_decks(text, text, text, integer) TO authenticated;

-- ── bump_forks_and_unpublish: unpublish only ──────────────────────────────
CREATE OR REPLACE FUNCTION public.bump_forks_and_unpublish(p_deck_id uuid, p_unpublish boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner uuid;
BEGIN
  -- fork_count moves only through fork_public_deck(); a bare bump is a no-op.
  IF NOT p_unpublish THEN
    RETURN;
  END IF;

  SELECT user_id INTO v_owner FROM public.decks WHERE id = p_deck_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'deck not found' USING ERRCODE = 'P0002';
  ELSIF v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'not deck owner' USING ERRCODE = '42501';
  END IF;

  UPDATE public.decks SET is_public = false WHERE id = p_deck_id;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_forks_and_unpublish(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bump_forks_and_unpublish(uuid, boolean) TO authenticated;

-- Bookkeeping
INSERT INTO schema_migrations (version, description)
VALUES (
  '20260929_marketplace_fork_and_listing',
  'fork_public_deck() copies a public deck server-side (fixes broken forking); list_public_decks() backs the Community tab; bump_forks_and_unpublish no longer bumps'
)
ON CONFLICT (version) DO NOTHING;
