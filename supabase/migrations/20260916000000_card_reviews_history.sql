-- card_reviews becomes true history: one row per review, not per card.
--
-- Until now UNIQUE(card_id) + ON CONFLICT DO UPDATE collapsed every card to
-- its latest review. That contradicts the reader: useSessionReplay queries
-- card_reviews by session window ([started_at, ended_at], up to 64 rows
-- ordered by reviewed_at), so re-grading a card in a later session MOVED its
-- row out of the earlier session's window and silently erased it from that
-- session's replay.
--
-- New contract:
--   - each review inserts its own row;
--   - UNIQUE(user_id, card_id, reviewed_at) keeps offline re-flush idempotent
--     (the offline queue replays the ORIGINAL review timestamp, which is
--     millisecond-stable across retries, so a retry conflicts and no-ops
--     instead of duplicating; two genuinely distinct reviews never share a
--     millisecond from UI-driven grading, and the no-op direction drops a
--     duplicate rather than corrupting counts);
--   - the existing idx_card_reviews_user_id (user_id, reviewed_at DESC)
--     already covers the replay reader's access path.
--
-- IDEMPOTENT: IF NOT EXISTS / DROP IF EXISTS / CREATE OR REPLACE throughout.
-- Safe on a live DB: no existing rows can violate the new unique key
-- (UNIQUE(card_id) implies unique triples), and the wider rating bound
-- 0..5 from 20260915000000 is preserved verbatim in the redefined RPC.

-- 1. Drop the latest-only constraint.
ALTER TABLE card_reviews
  DROP CONSTRAINT IF EXISTS card_reviews_card_id_unique;

-- 2. Idempotency key for retries (see header).
CREATE UNIQUE INDEX IF NOT EXISTS card_reviews_user_card_reviewed_ux
  ON card_reviews (user_id, card_id, reviewed_at);

CREATE OR REPLACE FUNCTION record_card_review(
  p_card_id        UUID,
  p_rating         INTEGER,
  p_srs_result     JSONB,
  p_user_id        UUID        DEFAULT NULL,
  p_srs_algorithm  TEXT        DEFAULT 'fsrs',
  p_reviewed_at    TIMESTAMPTZ DEFAULT NOW()
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card_owner UUID;
  v_rating     INTEGER;
  v_user_id    UUID := COALESCE(p_user_id, auth.uid());
BEGIN
  -- ── Reviewer identity ───────────────────────────────────────────────
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'record_card_review: anonymous caller has no auth.uid'
      USING ERRCODE = '42501';
  END IF;

  -- 1. The caller must be writing their own review.
  IF v_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'record_card_review: caller is not the rated user'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Rating must be a non-null integer in the FSRS v5 surface range
  --    (0..5), matching the live `card_reviews.rating` CHECK constraint.
  IF p_rating IS NULL THEN
    RAISE EXCEPTION 'record_card_review: rating cannot be NULL'
      USING ERRCODE = '22000';
  END IF;
  IF p_rating < 0 OR p_rating > 5 THEN
    RAISE EXCEPTION 'record_card_review: rating must be an integer 0..5, got %', p_rating
      USING ERRCODE = '22000';
  END IF;
  v_rating := p_rating;

  -- 3. The card must exist AND belong to the reviewing user.
  SELECT user_id INTO v_card_owner
    FROM cards
    WHERE id = p_card_id;
  IF v_card_owner IS NULL THEN
    RAISE EXCEPTION 'record_card_review: card % not found', p_card_id
      USING ERRCODE = 'P0002';
  ELSIF v_card_owner <> v_user_id THEN
    RAISE EXCEPTION 'record_card_review: card does not belong to caller'
      USING ERRCODE = '42501';
  END IF;

  -- ── Write ────────────────────────────────────────────────────────────
  -- One row per review. A retry of the same review carries the same
  -- (user_id, card_id, reviewed_at) triple — the offline queue replays the
  -- ORIGINAL review timestamp — so it conflicts and no-ops instead of
  -- duplicating. Genuinely distinct reviews always differ in reviewed_at.

  INSERT INTO card_reviews (
    user_id, card_id, rating, srs_result, srs_algorithm, reviewed_at, synced_at
  )
  VALUES (
    v_user_id, p_card_id, v_rating, p_srs_result, p_srs_algorithm, p_reviewed_at, NOW()
  )
  ON CONFLICT (user_id, card_id, reviewed_at) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION record_card_review(
  UUID, INTEGER, JSONB, UUID, TEXT, TIMESTAMPTZ
) TO authenticated;

-- ── Bookkeeping ─────────────────────────────────────────────────────────
INSERT INTO schema_migrations (version, description)
VALUES (
  '20260916000000_card_reviews_history',
  'card_reviews stores one row per review (drop UNIQUE(card_id), add user/card/reviewed_at idempotency key, RPC inserts instead of upserting) so session replay sees per-session history'
)
ON CONFLICT (version) DO NOTHING;
