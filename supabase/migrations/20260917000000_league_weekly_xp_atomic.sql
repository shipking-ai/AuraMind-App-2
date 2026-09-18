-- League weekly XP: fix the double count and make the RPC the only writer.
--
-- 1. Double count. increment_weekly_xp (20260720120000) read the stored total,
--    computed v_new_xp = prev + delta, inserted THAT as the row value, and then
--    on conflict added it again: weekly_xp + EXCLUDED.weekly_xp, i.e.
--    prev + (prev + delta). Every session after the first roughly doubled the
--    user's standing. The read-then-write also raced: two sessions finishing
--    together both read the same prev.
--
--    Fix: insert p_xp_delta and let ON CONFLICT add p_xp_delta to the live row,
--    with the accuracy EMA computed from the live row in the same statement.
--    RETURNING hands back the committed values, so there is no separate read
--    and no race window.
--
-- 2. Self-awarded XP. RLS let a signed-in user INSERT/UPDATE their own
--    league_memberships row directly, so anyone could set weekly_xp to any
--    number with one PostgREST call and top the leaderboard. The client now
--    goes through the RPC (which validates delta >= 0 and tier 1..10), so the
--    direct write policies are dropped. SELECT stays open for the leaderboard.
--
-- IDEMPOTENT: CREATE OR REPLACE / DROP POLICY IF EXISTS. Signature unchanged,
-- so the EXECUTE grants from 20260908000000 carry over.

CREATE OR REPLACE FUNCTION public.increment_weekly_xp(
  p_user_id      UUID,
  p_group_id     TEXT,
  p_tier         INT,
  p_xp_delta     INT,
  p_accuracy     NUMERIC
) RETURNS TABLE (
  weekly_xp      INT,
  accuracy_rate  REAL,
  group_id       TEXT,
  tier           INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_season_id  TEXT;
  v_starts_at  TIMESTAMPTZ;
  v_accuracy   REAL;
  v_new_xp     INT;
  v_new_acc    REAL;
BEGIN
  IF auth.uid() IS NULL OR p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'cannot increment weekly XP for another user'
      USING ERRCODE = '42501';
  END IF;

  IF p_xp_delta IS NULL OR p_xp_delta < 0 THEN
    RAISE EXCEPTION 'xp_delta must be >= 0' USING ERRCODE = '22023';
  END IF;

  IF p_tier IS NULL OR p_tier < 1 OR p_tier > 10 THEN
    RAISE EXCEPTION 'tier must be in [1, 10]' USING ERRCODE = '22023';
  END IF;

  IF p_group_id IS NULL OR length(p_group_id) = 0 OR length(p_group_id) > 64 THEN
    RAISE EXCEPTION 'group_id is required' USING ERRCODE = '22023';
  END IF;

  -- ISO week label, matching currentSeasonId() in src/types/league.ts.
  v_season_id := to_char(NOW() AT TIME ZONE 'UTC', 'IYYY-"W"IW');
  v_starts_at := date_trunc('week', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  INSERT INTO public.league_seasons (id, starts_at, ends_at)
  VALUES (v_season_id, v_starts_at, v_starts_at + INTERVAL '7 days')
  ON CONFLICT (id) DO NOTHING;

  v_accuracy := CASE
    WHEN p_accuracy IS NULL THEN NULL
    ELSE GREATEST(0, LEAST(100, p_accuracy))::REAL
  END;

  INSERT INTO public.league_memberships AS m (
    season_id, user_id, league_group_id, tier, weekly_xp, accuracy_rate
  )
  VALUES (
    v_season_id, p_user_id, p_group_id, p_tier, p_xp_delta, COALESCE(v_accuracy, 0)
  )
  ON CONFLICT (season_id, user_id) DO UPDATE
    SET weekly_xp       = m.weekly_xp + p_xp_delta,
        -- EMA: prior accuracy 70%, new sample 30%; first sample taken as-is.
        accuracy_rate   = CASE
                            WHEN v_accuracy IS NULL THEN m.accuracy_rate
                            WHEN m.accuracy_rate = 0 THEN v_accuracy
                            ELSE GREATEST(0, LEAST(100, 0.7 * m.accuracy_rate + 0.3 * v_accuracy))::REAL
                          END,
        league_group_id = EXCLUDED.league_group_id,
        tier            = EXCLUDED.tier,
        updated_at      = NOW()
  RETURNING m.weekly_xp, m.accuracy_rate INTO v_new_xp, v_new_acc;

  RETURN QUERY SELECT v_new_xp, v_new_acc, p_group_id, p_tier;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_weekly_xp(UUID, TEXT, INT, INT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_weekly_xp(UUID, TEXT, INT, INT, NUMERIC) TO authenticated;

-- Writes go through the RPC only. Both generations of policy names exist
-- (20260715_leagues_marketplace and 20260719_league_tables).
DROP POLICY IF EXISTS "Users can insert own league membership" ON public.league_memberships;
DROP POLICY IF EXISTS "Users can update own league membership" ON public.league_memberships;
DROP POLICY IF EXISTS "Users insert own league membership" ON public.league_memberships;
DROP POLICY IF EXISTS "Users update own league membership" ON public.league_memberships;

-- ── Bookkeeping ─────────────────────────────────────────────────────────
INSERT INTO schema_migrations (version, description)
VALUES (
  '20260917000000_league_weekly_xp_atomic',
  'increment_weekly_xp adds the delta once in a single atomic upsert (was prev + (prev + delta)); league_memberships writes restricted to the RPC'
)
ON CONFLICT (version) DO NOTHING;
