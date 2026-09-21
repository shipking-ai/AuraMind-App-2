-- ============================================================
-- Classroom quizzes: real questions, graded on the server.
--
-- Before: a quiz assignment had no content. The student typed their own
-- "correct / total" into record_assignment_progress, so any score could be
-- reported.
--
-- Now a quiz is built from one of the teacher's decks:
--   * get_quiz_questions   — up to 20 multiple-choice questions for the
--     caller (card front as the prompt; the right back plus up to three
--     other backs from the same deck as choices). No answer key is sent.
--   * submit_quiz_attempt  — grades the answers against the deck on the
--     server and records score, accuracy and the missed prompts.
--   * create_assignment    — a quiz needs a deck the teacher owns with at
--     least two cards (distinct answers make the choices).
--   * record_assignment_progress — self-reported scores are refused for
--     deck-backed quizzes. Quizzes created before this migration have no
--     deck and keep the old self-report path.
--
-- The question set is deterministic per (student, card), so a reload shows
-- the same questions in the same order and grading sees the same set.
--
-- IDEMPOTENT: CREATE OR REPLACE throughout.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_assignment(
  p_classroom_id UUID,
  p_title TEXT,
  p_instructions TEXT DEFAULT NULL,
  p_kind TEXT DEFAULT 'deck',
  p_deck_id UUID DEFAULT NULL,
  p_payload JSONB DEFAULT NULL,
  p_start_at TIMESTAMPTZ DEFAULT NULL,
  p_due_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF public.assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_deck_owner UUID;
  v_deck_title TEXT;
  v_card_count INTEGER;
  v_row public.assignments;
BEGIN
  IF NOT public.is_class_teacher(p_classroom_id) THEN
    RAISE EXCEPTION 'create_assignment: caller is not a teacher here' USING ERRCODE = '42501';
  END IF;
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'create_assignment: title is required' USING ERRCODE = '22023';
  END IF;
  IF p_kind NOT IN ('deck', 'quiz') THEN
    RAISE EXCEPTION 'create_assignment: kind must be deck or quiz' USING ERRCODE = '22023';
  END IF;
  IF p_due_at IS NOT NULL AND p_start_at IS NOT NULL AND p_due_at <= p_start_at THEN
    RAISE EXCEPTION 'create_assignment: due_at must be after start_at' USING ERRCODE = '22023';
  END IF;

  -- Both kinds are built from a deck the teacher owns: a deck assignment
  -- copies it, a quiz draws its questions from it.
  IF p_kind IN ('deck', 'quiz') THEN
    IF p_deck_id IS NULL THEN
      RAISE EXCEPTION 'create_assignment: deck_id required' USING ERRCODE = '22023';
    END IF;
    SELECT user_id, name INTO v_deck_owner, v_deck_title
    FROM public.decks WHERE id = p_deck_id;
    IF v_deck_owner IS NULL THEN
      RAISE EXCEPTION 'create_assignment: deck not found' USING ERRCODE = 'P0002';
    ELSIF v_deck_owner <> v_uid THEN
      RAISE EXCEPTION 'create_assignment: you can only assign decks you own' USING ERRCODE = '42501';
    END IF;
    SELECT count(*) INTO v_card_count FROM public.cards WHERE deck_id = p_deck_id;
    IF p_kind = 'quiz' AND (
      SELECT count(DISTINCT back) FROM public.cards
      WHERE deck_id = p_deck_id AND user_id = v_uid AND coalesce(trim(back), '') <> ''
    ) < 2 THEN
      RAISE EXCEPTION 'create_assignment: a quiz deck needs at least two cards with different answers' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.assignments (
    classroom_id, created_by, title, instructions, kind,
    deck_id, deck_title, deck_card_count, payload, start_at, due_at
  )
  VALUES (
    p_classroom_id, v_uid, trim(p_title), NULLIF(p_instructions, ''), p_kind,
    p_deck_id, v_deck_title, COALESCE(v_card_count, 0), p_payload, p_start_at, p_due_at
  )
  RETURNING * INTO v_row;

  RETURN QUERY SELECT * FROM public.assignments WHERE id = v_row.id;
END;
$$;

-- Internal: the quiz's question set for one student. Shared by both RPCs so
-- the questions shown and the questions graded can never drift apart.
CREATE OR REPLACE FUNCTION public.classroom_quiz_cards(p_deck_id UUID, p_owner UUID, p_student UUID)
RETURNS TABLE (card_id UUID, front TEXT, back TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id, c.front, c.back
  FROM public.cards c
  WHERE c.deck_id = p_deck_id
    AND c.user_id = p_owner
    AND coalesce(trim(c.front), '') <> ''
    AND coalesce(trim(c.back), '') <> ''
  ORDER BY md5(c.id::text || p_student::text)
  LIMIT 20;
$$;

-- Internal: load a quiz assignment the caller may take, or raise.
CREATE OR REPLACE FUNCTION public.classroom_quiz_assignment(p_assignment_id UUID)
RETURNS public.assignments
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.assignments;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'quiz: anonymous caller' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_row FROM public.assignments WHERE id = p_assignment_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'quiz: assignment not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_class_member(v_row.classroom_id) THEN
    RAISE EXCEPTION 'quiz: caller is not a member of this class' USING ERRCODE = '42501';
  END IF;
  IF v_row.kind <> 'quiz' OR v_row.deck_id IS NULL THEN
    RAISE EXCEPTION 'quiz: assignment has no question deck' USING ERRCODE = '22000';
  END IF;
  -- Same rule accept_class_deck applies: only the assigning teacher's deck.
  IF NOT EXISTS (
    SELECT 1 FROM public.decks WHERE id = v_row.deck_id AND user_id = v_row.created_by
  ) THEN
    RAISE EXCEPTION 'quiz: deck is not owned by the assigning teacher' USING ERRCODE = '42501';
  END IF;
  RETURN v_row;
END;
$$;

-- Choices: the right answer plus up to three other answers from the deck,
-- in an order that is stable per question but not alphabetical.
CREATE OR REPLACE FUNCTION public.get_quiz_questions(p_assignment_id UUID)
RETURNS TABLE (card_id UUID, prompt TEXT, choices TEXT[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_a public.assignments := public.classroom_quiz_assignment(p_assignment_id);
BEGIN
  RETURN QUERY
  SELECT q.card_id,
         q.front,
         ARRAY(
           SELECT o.opt FROM (
             SELECT q.back AS opt
             UNION ALL
             (
               SELECT d.back FROM (
                 SELECT DISTINCT c.back
                 FROM public.cards c
                 WHERE c.deck_id = v_a.deck_id
                   AND c.user_id = v_a.created_by
                   AND coalesce(trim(c.back), '') <> ''
                   AND c.back <> q.back
               ) d
               ORDER BY md5(d.back || q.card_id::text)
               LIMIT 3
             )
           ) o
           ORDER BY md5(o.opt || q.card_id::text || 'order')
         )
  FROM public.classroom_quiz_cards(v_a.deck_id, v_a.created_by, auth.uid()) q;
END;
$$;

-- p_answers: {"<card_id>": "<chosen text>", ...}. Unanswered counts wrong.
CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(p_assignment_id UUID, p_answers JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_a public.assignments := public.classroom_quiz_assignment(p_assignment_id);
  v_total INTEGER;
  v_correct INTEGER;
  v_missed JSONB;
  v_accuracy REAL;
  v_attempts INTEGER;
  v_progress_id UUID;
BEGIN
  IF p_answers IS NULL OR jsonb_typeof(p_answers) <> 'object' THEN
    RAISE EXCEPTION 'submit_quiz_attempt: answers must be an object' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::int,
         (count(*) FILTER (WHERE p_answers ->> q.card_id::text = q.back))::int,
         coalesce(
           jsonb_agg(jsonb_build_object('front', q.front, 'misses', 1))
             FILTER (WHERE (p_answers ->> q.card_id::text) IS DISTINCT FROM q.back),
           '[]'::jsonb)
  INTO v_total, v_correct, v_missed
  FROM public.classroom_quiz_cards(v_a.deck_id, v_a.created_by, v_uid) q;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'submit_quiz_attempt: quiz has no questions' USING ERRCODE = '22000';
  END IF;
  v_accuracy := (v_correct::real / v_total) * 100;

  SELECT coalesce((details ->> 'attempts')::int, 0) + 1 INTO v_attempts
  FROM public.assignment_progress
  WHERE assignment_id = p_assignment_id AND user_id = v_uid;
  v_attempts := coalesce(v_attempts, 1);

  INSERT INTO public.assignment_progress (
    assignment_id, classroom_id, user_id, status, started_at, completed_at,
    score, score_total, accuracy, details
  )
  VALUES (
    p_assignment_id, v_a.classroom_id, v_uid, 'completed', NOW(), NOW(),
    v_correct, v_total, v_accuracy,
    jsonb_build_object('most_missed', v_missed, 'attempts', v_attempts, 'graded', true)
  )
  -- Retakes are allowed; the teacher sees the best attempt (and how many
  -- attempts there were). completed_at marks when that best was reached.
  ON CONFLICT (assignment_id, user_id) DO UPDATE SET
    status       = 'completed',
    completed_at = CASE WHEN assignment_progress.accuracy IS NULL OR EXCLUDED.accuracy >= assignment_progress.accuracy
                        THEN NOW() ELSE assignment_progress.completed_at END,
    score        = CASE WHEN assignment_progress.accuracy IS NULL OR EXCLUDED.accuracy >= assignment_progress.accuracy
                        THEN EXCLUDED.score ELSE assignment_progress.score END,
    score_total  = CASE WHEN assignment_progress.accuracy IS NULL OR EXCLUDED.accuracy >= assignment_progress.accuracy
                        THEN EXCLUDED.score_total ELSE assignment_progress.score_total END,
    details      = CASE WHEN assignment_progress.accuracy IS NULL OR EXCLUDED.accuracy >= assignment_progress.accuracy
                        THEN EXCLUDED.details
                        ELSE jsonb_set(coalesce(assignment_progress.details, '{}'::jsonb), '{attempts}', to_jsonb(v_attempts)) END,
    accuracy     = GREATEST(coalesce(assignment_progress.accuracy, 0), EXCLUDED.accuracy)
  RETURNING id INTO v_progress_id;

  RETURN jsonb_build_object(
    'progress_id', v_progress_id,
    'score', v_correct,
    'score_total', v_total,
    'accuracy', v_accuracy,
    'attempts', v_attempts,
    'missed', v_missed
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_assignment_progress(
  p_assignment_id UUID,
  p_local_deck_id UUID DEFAULT NULL,
  p_quiz_correct INTEGER DEFAULT NULL,
  p_quiz_total INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_assignment RECORD;
  v_status TEXT;
  v_started TIMESTAMPTZ;
  v_completed TIMESTAMPTZ;
  v_cards_total INTEGER;
  v_cards_reviewed INTEGER;
  v_missed INTEGER;
  v_accuracy REAL;
  v_time_spent_s INTEGER;
  v_score INTEGER;
  v_score_total INTEGER;
  v_details JSONB;
  v_most_missed JSONB;
  v_window TIMESTAMPTZ;
  v_progress_id UUID;
  v_prev_started TIMESTAMPTZ;
  v_prev_status TEXT;
  v_local_deck_id UUID;
  v_card_owner UUID;
BEGIN
  SELECT id, classroom_id, kind, start_at, created_at, deck_id
  INTO v_assignment
  FROM public.assignments WHERE id = p_assignment_id;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'record_assignment_progress: assignment not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_class_member(v_assignment.classroom_id) THEN
    RAISE EXCEPTION 'record_assignment_progress: caller is not a member of this class' USING ERRCODE = '42501';
  END IF;

  SELECT status, started_at INTO v_prev_status, v_prev_started
  FROM public.assignment_progress
  WHERE assignment_id = p_assignment_id AND user_id = v_uid;

  v_window := COALESCE(v_assignment.start_at, v_assignment.created_at);

  IF v_assignment.kind = 'deck' THEN
    v_local_deck_id := COALESCE(p_local_deck_id,
      (SELECT local_deck_id FROM public.assignment_progress
       WHERE assignment_id = p_assignment_id AND user_id = v_uid));
    IF v_local_deck_id IS NULL THEN
      RAISE EXCEPTION 'record_assignment_progress: accept the deck assignment first (no local deck)' USING ERRCODE = '22000';
    END IF;
    SELECT user_id INTO v_card_owner FROM public.decks WHERE id = v_local_deck_id;
    IF v_card_owner IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'record_assignment_progress: local deck must be your own copy' USING ERRCODE = '42501';
    END IF;

    SELECT count(*) INTO v_cards_total
    FROM public.cards WHERE deck_id = v_local_deck_id AND user_id = v_uid;

    SELECT count(DISTINCT cr.card_id),
           count(*) FILTER (WHERE cr.rating = 0)::int
    INTO v_cards_reviewed, v_missed
    FROM public.card_reviews cr
    JOIN public.cards c ON c.id = cr.card_id
    WHERE cr.user_id = v_uid
      AND c.deck_id = v_local_deck_id
      AND c.user_id = v_uid
      AND cr.reviewed_at >= v_window;

    SELECT COALESCE(sum(duration_ms) / 1000, 0)::int INTO v_time_spent_s
    FROM public.study_sessions
    WHERE user_id = v_uid AND deck_id = v_local_deck_id AND started_at >= v_window;

    IF v_cards_reviewed > 0 THEN
      v_accuracy := GREATEST(0, LEAST(100, ((v_cards_reviewed - v_missed)::real / v_cards_reviewed) * 100))::real;
    END IF;

    SELECT jsonb_agg(m) INTO v_most_missed FROM (
      SELECT jsonb_build_object('front', c.front, 'misses', count(*)::int) AS m
      FROM public.card_reviews cr
      JOIN public.cards c ON c.id = cr.card_id
      WHERE cr.user_id = v_uid
        AND c.deck_id = v_local_deck_id
        AND c.user_id = v_uid
        AND cr.rating = 0
        AND cr.reviewed_at >= v_window
      GROUP BY c.front
      ORDER BY count(*) DESC
      LIMIT 5
    ) t;

    IF v_cards_total > 0 AND v_cards_reviewed >= v_cards_total THEN
      v_status := 'completed';
    ELSIF v_cards_reviewed > 0 THEN
      v_status := 'in_progress';
    ELSE
      v_status := 'assigned';
    END IF;

    v_details := jsonb_build_object('most_missed', COALESCE(v_most_missed, '[]'::jsonb));
    v_score := NULL;
    v_score_total := NULL;
  ELSE
    -- Legacy quiz (created before questions existed): self-reported score.
    -- A deck-backed quiz is graded by submit_quiz_attempt, never self-reported.
    IF v_assignment.deck_id IS NOT NULL THEN
      RAISE EXCEPTION 'record_assignment_progress: this quiz is graded by submit_quiz_attempt' USING ERRCODE = '42501';
    END IF;
    IF p_quiz_total IS NULL OR p_quiz_total <= 0 OR p_quiz_correct IS NULL OR p_quiz_correct < 0 OR p_quiz_correct > p_quiz_total THEN
      RAISE EXCEPTION 'record_assignment_progress: invalid quiz score' USING ERRCODE = '22023';
    END IF;
    v_score := p_quiz_correct;
    v_score_total := p_quiz_total;
    v_status := 'completed';
    v_cards_total := NULL;
    v_cards_reviewed := NULL;
    v_missed := NULL;
    v_accuracy := (p_quiz_correct::real / p_quiz_total) * 100;
    v_time_spent_s := NULL;
    v_local_deck_id := NULL;
    v_details := NULL;
  END IF;

  v_started := CASE WHEN v_cards_reviewed IS NULL OR v_cards_reviewed > 0 THEN COALESCE(v_prev_started, NOW()) ELSE v_prev_started END;
  IF v_status = 'completed' THEN
    v_completed := NOW();
  END IF;
  -- Never regress a completed assignment back to in_progress.
  IF v_prev_status = 'completed' THEN
    v_status := 'completed';
    v_completed := COALESCE((SELECT completed_at FROM public.assignment_progress WHERE assignment_id = p_assignment_id AND user_id = v_uid), NOW());
  END IF;

  INSERT INTO public.assignment_progress (
    assignment_id, classroom_id, user_id, local_deck_id, status,
    started_at, completed_at, score, score_total, accuracy,
    cards_total, cards_reviewed, misses, time_spent_s, details
  )
  VALUES (
    p_assignment_id, v_assignment.classroom_id, v_uid, v_local_deck_id, v_status,
    v_started, v_completed, v_score, v_score_total, v_accuracy,
    v_cards_total, v_cards_reviewed, v_missed, v_time_spent_s, v_details
  )
  ON CONFLICT (assignment_id, user_id) DO UPDATE SET
    status        = EXCLUDED.status,
    started_at    = COALESCE(assignment_progress.started_at, EXCLUDED.started_at),
    completed_at  = EXCLUDED.completed_at,
    score         = EXCLUDED.score,
    score_total   = EXCLUDED.score_total,
    accuracy      = EXCLUDED.accuracy,
    cards_total   = EXCLUDED.cards_total,
    cards_reviewed = EXCLUDED.cards_reviewed,
    misses        = EXCLUDED.misses,
    time_spent_s  = EXCLUDED.time_spent_s,
    details       = EXCLUDED.details,
    local_deck_id = COALESCE(EXCLUDED.local_deck_id, assignment_progress.local_deck_id)
  RETURNING id INTO v_progress_id;

  RETURN jsonb_build_object(
    'progress_id', v_progress_id,
    'status', v_status,
    'started_at', v_started,
    'completed_at', v_completed,
    'score', v_score,
    'score_total', v_score_total,
    'accuracy', v_accuracy,
    'cards_total', v_cards_total,
    'cards_reviewed', v_cards_reviewed,
    'misses', v_missed,
    'time_spent_s', v_time_spent_s,
    'most_missed', COALESCE(v_details->'most_missed', '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.classroom_quiz_cards(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.classroom_quiz_assignment(UUID) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.get_quiz_questions(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_quiz_questions(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.submit_quiz_attempt(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(UUID, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.create_assignment(UUID, TEXT, TEXT, TEXT, UUID, JSONB, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_assignment(UUID, TEXT, TEXT, TEXT, UUID, JSONB, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

REVOKE ALL ON FUNCTION public.record_assignment_progress(UUID, UUID, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_assignment_progress(UUID, UUID, INTEGER, INTEGER) TO authenticated;

INSERT INTO schema_migrations (version, description)
VALUES (
  '20260921000100_classroom_quiz_grading',
  'Classroom quizzes: multiple-choice questions from the teacher''s deck, graded server-side; self-reported scores refused for deck-backed quizzes.'
)
ON CONFLICT (version) DO NOTHING;
