-- Security: close cross-user card injection, and consolidate duplicate RLS.
--
-- cards carried two PERMISSIVE policies per command, from two generations of
-- the schema: "own cards" (auth.uid() = user_id) and "cards in own decks"
-- (the deck belongs to auth.uid()). Permissive policies OR together, so each
-- command only had to satisfy the weaker of the two:
--
--   * INSERT / UPDATE via "own cards": a user could write a card they own
--     into SOMEONE ELSE's deck (any deck id they know — public deck ids are
--     readable). The victim's "cards in own decks" SELECT then showed it to
--     them, so arbitrary content landed in another user's study queue.
--   * UPDATE via "cards in own decks": a deck owner could set a card's
--     user_id to another user, pushing it into that user's "own cards" view.
--
-- Every card now has to satisfy BOTH: the caller owns the card AND owns its
-- deck. Verified against the live data before writing this: all 121 cards
-- have user_id equal to their deck's owner (0 mismatches, 0 orphans), so no
-- existing card becomes invisible. Server paths (service role, SECURITY
-- DEFINER RPCs such as accept_class_deck) bypass RLS and are unaffected.
--
-- Same pass, same "one policy per (cmd, table)" rule from SECURITY.md:
--   * decks: "Users can view own decks" is a strict subset of
--     "Anyone can view public decks" (is_public OR own) — dropped.
--   * decks / study_sessions UPDATE get an explicit WITH CHECK. Postgres
--     already fell back to USING, so this is hygiene, not a behaviour change.
--   * league_memberships / league_seasons: 20260719_league_tables.sql moved
--     reads to TO authenticated, but the older "Anyone can read ..." policies
--     from 20260715 were never dropped, so anon could still list every
--     user_id and weekly XP. Dropped; only the dashboard reads these, signed in.
--
-- Idempotent: every policy is DROP ... IF EXISTS before it is (re)created.
-- (select auth.uid()) is evaluated once per statement, not per row.

-- ── cards ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own cards"              ON public.cards;
DROP POLICY IF EXISTS "Users can view cards in own decks"     ON public.cards;
DROP POLICY IF EXISTS "Users can insert own cards"            ON public.cards;
DROP POLICY IF EXISTS "Users can create cards in own decks"   ON public.cards;
DROP POLICY IF EXISTS "Users can update own cards"            ON public.cards;
DROP POLICY IF EXISTS "Users can update cards in own decks"   ON public.cards;
DROP POLICY IF EXISTS "Users can delete own cards"            ON public.cards;
DROP POLICY IF EXISTS "Users can delete cards in own decks"   ON public.cards;

DROP POLICY IF EXISTS "Owners read cards in their own decks"   ON public.cards;
DROP POLICY IF EXISTS "Owners add cards to their own decks"    ON public.cards;
DROP POLICY IF EXISTS "Owners edit cards in their own decks"   ON public.cards;
DROP POLICY IF EXISTS "Owners delete cards in their own decks" ON public.cards;

CREATE POLICY "Owners read cards in their own decks"
  ON public.cards FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM public.decks d
                WHERE d.id = cards.deck_id AND d.user_id = (select auth.uid()))
  );

CREATE POLICY "Owners add cards to their own decks"
  ON public.cards FOR INSERT
  TO authenticated
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM public.decks d
                WHERE d.id = cards.deck_id AND d.user_id = (select auth.uid()))
  );

CREATE POLICY "Owners edit cards in their own decks"
  ON public.cards FOR UPDATE
  TO authenticated
  USING (
    (select auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM public.decks d
                WHERE d.id = cards.deck_id AND d.user_id = (select auth.uid()))
  )
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM public.decks d
                WHERE d.id = cards.deck_id AND d.user_id = (select auth.uid()))
  );

CREATE POLICY "Owners delete cards in their own decks"
  ON public.cards FOR DELETE
  TO authenticated
  USING (
    (select auth.uid()) = user_id
    AND EXISTS (SELECT 1 FROM public.decks d
                WHERE d.id = cards.deck_id AND d.user_id = (select auth.uid()))
  );

-- ── decks ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view own decks" ON public.decks;

DROP POLICY IF EXISTS "Users can update own decks" ON public.decks;
CREATE POLICY "Users can update own decks"
  ON public.decks FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── study_sessions ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can update own study sessions" ON public.study_sessions;
CREATE POLICY "Users can update own study sessions"
  ON public.study_sessions FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- ── leagues ────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can read league memberships" ON public.league_memberships;
DROP POLICY IF EXISTS "Anyone can read league seasons"     ON public.league_seasons;

-- Bookkeeping
INSERT INTO schema_migrations (version, description)
VALUES (
  '20260929_cards_rls_owner_and_deck',
  'cards policies require card AND deck ownership (closes cross-user card injection); drop duplicate decks/league SELECT policies; explicit WITH CHECK on decks/study_sessions UPDATE'
)
ON CONFLICT (version) DO NOTHING;
