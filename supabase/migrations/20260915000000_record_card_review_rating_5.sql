-- Widen record_card_review rating bound from 0..4 to 0..5.
--
-- The table CHECK was already widened to 0..5 by
-- 20260803000010_card_reviews_rating_range_fix, and the JS service validates
-- ratings 0..5 (cardReviewsService.recordReview), but this RPC still raised
-- 22000 for p_rating = 5 — so an "Easy / perfect recall" review failed at
-- the DB layer while the table would have accepted it.
--
-- IDEMPOTENT: CREATE OR REPLACE for the function body. Safe on a live DB.

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
  --    AuraMind supports (0..5), matching the live `card_reviews.rating`
  --    CHECK constraint (widened to 0..5 by 20260803000010). Previously
  --    0..4 here while the table allowed 5, so Easy/perfect-recall
  --    reviews 22000'd at this gate.
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
  -- One row per card (unique(card_id)). Repeating a review replaces the
  -- previous row in place — the session-replay semantic (SessionReplayModal
  -- shows the most recent outcome, not the chronology).

  INSERT INTO card_reviews (
    user_id, card_id, rating, srs_result, srs_algorithm, reviewed_at, synced_at
  )
  VALUES (
    v_user_id, p_card_id, v_rating, p_srs_result, p_srs_algorithm, p_reviewed_at, NOW()
  )
  ON CONFLICT (card_id) DO UPDATE
    SET rating        = EXCLUDED.rating,
        srs_result    = EXCLUDED.srs_result,
        srs_algorithm = EXCLUDED.srs_algorithm,
        reviewed_at   = EXCLUDED.reviewed_at,
        synced_at     = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION record_card_review(
  UUID, INTEGER, JSONB, UUID, TEXT, TIMESTAMPTZ
) TO authenticated;

-- ── Bookkeeping ─────────────────────────────────────────────────────────
INSERT INTO schema_migrations (version, description)
VALUES (
  '20260915000000_record_card_review_rating_5',
  'Widens record_card_review rating bound 0..4 to 0..5 to match the card_reviews CHECK and the JS service'
)
ON CONFLICT (version) DO NOTHING;
