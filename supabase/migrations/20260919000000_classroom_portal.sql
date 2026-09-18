-- Classroom Portal — student/teacher spaces, assignments, and progress.
--
-- Adds a Google Classroom / Quizlet-style layer on top of the existing
-- user-scoped decks/cards model WITHOUT touching auth or the global role
-- system. A user's global `app_metadata.role` is irrelevant here: the
-- teacher/student split is a property of *membership in one classroom*.
--
-- Design notes
-- ------------
-- 1. Every write goes through a SECURITY DEFINER RPC. There are no direct
--    INSERT/UPDATE/DELETE policies on the four new tables, which removes the
--    whole class of "forged POST to /rest/v1/<table>" privilege escalation.
-- 2. RLS SELECT is scoped to `authenticated` only. Policies call the
--    SECURITY DEFINER helpers is_class_member / is_class_teacher, and those
--    helpers are granted to `authenticated` alone — never to anon/PUBLIC —
--    so an anonymous read yields empty rows instead of evaluating a definer
--    function (mirrors 20260908000000's re-scoping fix).
-- 3. Students copy an assigned deck through accept_class_deck(), a definer
--    RPC that reads the teacher's source deck server-side and inserts a
--    NEW deck + cards owned by the student. The browser never sees
--    someone else's card rows. Assignments denormalize a deck_title /
--    deck_card_count snapshot precisely because students cannot read the
--    teacher's private decks row.
-- 4. Progress rows are computed by record_assignment_progress() from the
--    student's OWN card_reviews / study_sessions (both RLS-locked to the
--    owner), then surfaced to teachers via the SELECT policy. This is the
--    Quizlet privacy model: a student sees only their own rows; the teacher
--    sees everyone's. Most-missed terms are capped at 5 and stored in
--    details.most_missed.
--
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS / DROP POLICY IF EXISTS /
-- CREATE OR REPLACE FUNCTION throughout. Safe to re-run.

-- ============================================================
-- 1. Helper gates (SECURITY DEFINER, STABLE — callable from RLS policies)
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_class_member(p_classroom_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_classroom_id IS NULL OR auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.classroom_memberships
    WHERE classroom_id = p_classroom_id
      AND user_id = auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_class_teacher(p_classroom_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_classroom_id IS NULL OR auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.classroom_memberships
    WHERE classroom_id = p_classroom_id
      AND user_id = auth.uid()
      AND role = 'teacher'
  );
END;
$$;

-- ============================================================
-- 2. Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS public.classrooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  description TEXT,
  subject     TEXT,
  color       TEXT NOT NULL DEFAULT 'violet',
  invite_code TEXT NOT NULL UNIQUE
              CHECK (invite_code ~ '^[A-Z2-9]{6}$'),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.classroom_memberships (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  role         TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (classroom_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id    UUID NOT NULL REFERENCES public.classrooms(id) ON DELETE CASCADE,
  created_by      UUID NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  title           TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  instructions    TEXT,
  kind            TEXT NOT NULL DEFAULT 'deck' CHECK (kind IN ('deck', 'quiz')),
  -- deck assignments reference the teacher's source deck; the denormalized
  -- snapshot is what students are allowed to read (their own decks policy
  -- cannot read the teacher's private deck row).
  deck_id         UUID REFERENCES public.decks(id) ON DELETE SET NULL,
  deck_title      TEXT,
  deck_card_count INTEGER NOT NULL DEFAULT 0,
  payload         JSONB,
  start_at        TIMESTAMPTZ,
  due_at          TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (due_at IS NULL OR start_at IS NULL OR due_at > start_at)
);

CREATE TABLE IF NOT EXISTS public.assignment_progress (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id  UUID NOT NULL REFERENCES public.assignments(id)      ON DELETE CASCADE,
  classroom_id   UUID NOT NULL REFERENCES public.classrooms(id)       ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id)              ON DELETE CASCADE,
  local_deck_id  UUID,           -- student's own copy of the assigned deck (kind = 'deck')
  status         TEXT NOT NULL DEFAULT 'assigned'
                 CHECK (status IN ('assigned', 'in_progress', 'completed')),
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  score          INTEGER,        -- quiz: correct answers
  score_total    INTEGER,        -- quiz: total questions
  accuracy       REAL CHECK (accuracy IS NULL OR accuracy BETWEEN 0 AND 100),
  cards_total    INTEGER,
  cards_reviewed INTEGER,
  misses         INTEGER,
  time_spent_s   INTEGER,
  details        JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_classroom_memberships_user
  ON public.classroom_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_classroom_memberships_class
  ON public.classroom_memberships (classroom_id);
CREATE INDEX IF NOT EXISTS idx_assignments_class_created
  ON public.assignments (classroom_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_progress_assignment
  ON public.assignment_progress (assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_progress_user
  ON public.assignment_progress (user_id);

-- ============================================================
-- 3. updated_at maintenance triggers
-- ============================================================

CREATE OR REPLACE FUNCTION public.classroom_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_classrooms_touch_updated_at ON public.classrooms;
CREATE TRIGGER trg_classrooms_touch_updated_at
  BEFORE UPDATE ON public.classrooms
  FOR EACH ROW EXECUTE FUNCTION public.classroom_touch_updated_at();

DROP TRIGGER IF EXISTS trg_assignments_touch_updated_at ON public.assignments;
CREATE TRIGGER trg_assignments_touch_updated_at
  BEFORE UPDATE ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.classroom_touch_updated_at();

DROP TRIGGER IF EXISTS trg_assignment_progress_touch_updated_at ON public.assignment_progress;
CREATE TRIGGER trg_assignment_progress_touch_updated_at
  BEFORE UPDATE ON public.assignment_progress
  FOR EACH ROW EXECUTE FUNCTION public.classroom_touch_updated_at();

-- ============================================================
-- 4. RLS policies
-- ============================================================

ALTER TABLE public.classrooms              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classroom_memberships   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_progress     ENABLE ROW LEVEL SECURITY;

-- Every policy is TO authenticated. anon gets no rows (no policy matches
-- PUBLIC), so it never evaluates the SECURITY DEFINER helpers — no 500.

DROP POLICY IF EXISTS "Members read classrooms" ON public.classrooms;
CREATE POLICY "Members read classrooms"
  ON public.classrooms FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid() OR public.is_class_member(id));

DROP POLICY IF EXISTS "Owner updates classroom" ON public.classrooms;
CREATE POLICY "Owner updates classroom"
  ON public.classrooms FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS "Owner deletes classroom" ON public.classrooms;
CREATE POLICY "Owner deletes classroom"
  ON public.classrooms FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Members read classroom memberships" ON public.classroom_memberships;
CREATE POLICY "Members read classroom memberships"
  ON public.classroom_memberships FOR SELECT
  TO authenticated
  USING (public.is_class_member(classroom_id));

DROP POLICY IF EXISTS "Members read assignments" ON public.assignments;
CREATE POLICY "Members read assignments"
  ON public.assignments FOR SELECT
  TO authenticated
  USING (public.is_class_member(classroom_id));

DROP POLICY IF EXISTS "Teachers update assignments" ON public.assignments;
CREATE POLICY "Teachers update assignments"
  ON public.assignments FOR UPDATE
  TO authenticated
  USING (public.is_class_teacher(classroom_id));

DROP POLICY IF EXISTS "Teachers delete assignments" ON public.assignments;
CREATE POLICY "Teachers delete assignments"
  ON public.assignments FOR DELETE
  TO authenticated
  USING (public.is_class_teacher(classroom_id));

-- Quizlet-style privacy: students read only their own progress row;
-- teachers read every row in the class. All writes go through the RPC.
DROP POLICY IF EXISTS "Self or teacher reads assignment progress" ON public.assignment_progress;
CREATE POLICY "Self or teacher reads assignment progress"
  ON public.assignment_progress FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_class_teacher(classroom_id));

-- ============================================================
-- 5. SECURITY DEFINER RPCs (the only writers)
-- ============================================================

-- Internal: 6-char code, unambiguous alphabet (no 0/O/1/I).
CREATE OR REPLACE FUNCTION public.generate_class_invite_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code TEXT;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
BEGIN
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.classrooms WHERE invite_code = v_code);
  END LOOP;
  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_classroom(
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_subject TEXT DEFAULT NULL,
  p_color TEXT DEFAULT 'violet'
)
RETURNS SETOF public.classrooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.classrooms;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'create_classroom: anonymous caller has no auth.uid' USING ERRCODE = '42501';
  END IF;
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'create_classroom: title is required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.classrooms (owner_id, title, description, subject, color, invite_code)
  VALUES (v_uid, trim(p_title), NULLIF(p_description, ''), NULLIF(p_subject, ''), COALESCE(NULLIF(p_color, ''), 'violet'), public.generate_class_invite_code())
  RETURNING * INTO v_row;

  -- The owner is the first teacher.
  INSERT INTO public.classroom_memberships (classroom_id, user_id, role)
  VALUES (v_row.id, v_uid, 'teacher');

  RETURN QUERY SELECT * FROM public.classrooms WHERE id = v_row.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_classroom(
  p_classroom_id UUID,
  p_title TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_subject TEXT DEFAULT NULL,
  p_color TEXT DEFAULT NULL
)
RETURNS SETOF public.classrooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_class_teacher(p_classroom_id) THEN
    RAISE EXCEPTION 'update_classroom: caller is not a teacher in this classroom' USING ERRCODE = '42501';
  END IF;

  UPDATE public.classrooms SET
    title       = COALESCE(NULLIF(trim(p_title), ''), title),
    description = COALESCE(NULLIF(p_description, ''), description),
    subject     = COALESCE(NULLIF(p_subject, ''), subject),
    color       = COALESCE(NULLIF(p_color, ''), color)
  WHERE id = p_classroom_id;

  RETURN QUERY SELECT * FROM public.classrooms WHERE id = p_classroom_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_classroom(p_classroom_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'delete_classroom: anonymous caller' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.classrooms
  WHERE id = p_classroom_id AND owner_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delete_classroom: only the owner can delete a classroom' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_class_invite_code(p_classroom_id UUID)
RETURNS SETOF public.classrooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_class_teacher(p_classroom_id) THEN
    RAISE EXCEPTION 'refresh_class_invite_code: caller is not a teacher here' USING ERRCODE = '42501';
  END IF;
  UPDATE public.classrooms SET invite_code = public.generate_class_invite_code()
  WHERE id = p_classroom_id;
  RETURN QUERY SELECT * FROM public.classrooms WHERE id = p_classroom_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_classroom_with_code(p_code TEXT)
RETURNS SETOF public.classrooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_class_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'join_classroom_with_code: anonymous caller' USING ERRCODE = '42501';
  END IF;
  IF p_code IS NULL OR length(p_code) = 0 THEN
    RAISE EXCEPTION 'join_classroom_with_code: code is required' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_class_id
  FROM public.classrooms WHERE invite_code = upper(trim(p_code));

  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'urn:auramind:classroom:not_found' USING ERRCODE = 'P0002';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.classroom_memberships
    WHERE classroom_id = v_class_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'urn:auramind:classroom:already_member' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.classroom_memberships (classroom_id, user_id, role)
  VALUES (v_class_id, v_uid, 'student');

  RETURN QUERY SELECT * FROM public.classrooms WHERE id = v_class_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_classroom(p_classroom_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'leave_classroom: anonymous caller' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.classroom_memberships
  WHERE classroom_id = p_classroom_id AND user_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM public.classrooms WHERE id = p_classroom_id AND owner_id = auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_classroom_member(p_classroom_id UUID, p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_class_teacher(p_classroom_id) THEN
    RAISE EXCEPTION 'remove_classroom_member: caller is not a teacher here' USING ERRCODE = '42501';
  END IF;
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'remove_classroom_member: use leave_classroom to leave' USING ERRCODE = '22000';
  END IF;
  -- The owner can never be removed via membership surgery.
  DELETE FROM public.classroom_memberships
  WHERE classroom_id = p_classroom_id
    AND user_id = p_user_id
    AND NOT EXISTS (SELECT 1 FROM public.classrooms WHERE id = p_classroom_id AND owner_id = p_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.set_class_member_role(p_classroom_id UUID, p_user_id UUID, p_role TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'set_class_member_role: anonymous caller' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.classrooms WHERE id = p_classroom_id AND owner_id = auth.uid()) THEN
    RAISE EXCEPTION 'set_class_member_role: only the classroom owner manages roles' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('teacher', 'student') THEN
    RAISE EXCEPTION 'set_class_member_role: role must be teacher or student' USING ERRCODE = '22023';
  END IF;
  -- The owner is always a teacher and stays one.
  UPDATE public.classroom_memberships
  SET role = p_role
  WHERE classroom_id = p_classroom_id
    AND user_id = p_user_id
    AND NOT EXISTS (SELECT 1 FROM public.classrooms WHERE id = p_classroom_id AND owner_id = p_user_id);
END;
$$;

-- Roster. Members see names; only teachers additionally get emails.
CREATE OR REPLACE FUNCTION public.classroom_roster(p_classroom_id UUID)
RETURNS TABLE (
  user_id UUID,
  display_name TEXT,
  email TEXT,
  role TEXT,
  joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_teacher BOOLEAN;
BEGIN
  IF NOT public.is_class_member(p_classroom_id) THEN
    RAISE EXCEPTION 'classroom_roster: caller is not a member' USING ERRCODE = '42501';
  END IF;
  v_teacher := public.is_class_teacher(p_classroom_id);

  RETURN QUERY
  SELECT cm.user_id,
         COALESCE(NULLIF(u.full_name, ''), u.email, cm.user_id::text) AS display_name,
         CASE WHEN v_teacher THEN u.email ELSE NULL END AS email,
         cm.role,
         cm.joined_at
  FROM public.classroom_memberships cm
  LEFT JOIN public.user_profiles u ON u.user_id = cm.user_id
  WHERE cm.classroom_id = p_classroom_id
  ORDER BY cm.role DESC, display_name ASC;
END;
$$;

-- Assignments ──────────────────────────────────────────────────────────────

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

  IF p_kind = 'deck' THEN
    IF p_deck_id IS NULL THEN
      RAISE EXCEPTION 'create_assignment: deck_id required for deck assignments' USING ERRCODE = '22023';
    END IF;
    SELECT user_id, name INTO v_deck_owner, v_deck_title
    FROM public.decks WHERE id = p_deck_id;
    IF v_deck_owner IS NULL THEN
      RAISE EXCEPTION 'create_assignment: deck not found' USING ERRCODE = 'P0002';
    ELSIF v_deck_owner <> v_uid THEN
      RAISE EXCEPTION 'create_assignment: you can only assign decks you own' USING ERRCODE = '42501';
    END IF;
    SELECT count(*) INTO v_card_count FROM public.cards WHERE deck_id = p_deck_id;
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

CREATE OR REPLACE FUNCTION public.update_assignment(
  p_assignment_id UUID,
  p_title TEXT DEFAULT NULL,
  p_instructions TEXT DEFAULT NULL,
  p_start_at TIMESTAMPTZ DEFAULT NULL,
  p_due_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS SETOF public.assignments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class_id UUID;
  v_start TIMESTAMPTZ;
  v_due TIMESTAMPTZ;
BEGIN
  SELECT classroom_id, start_at, due_at INTO v_class_id, v_start, v_due
  FROM public.assignments WHERE id = p_assignment_id;
  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'update_assignment: assignment not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_class_teacher(v_class_id) THEN
    RAISE EXCEPTION 'update_assignment: caller is not a teacher here' USING ERRCODE = '42501';
  END IF;

  v_start := COALESCE(p_start_at, v_start);
  v_due := COALESCE(p_due_at, v_due);
  IF v_due IS NOT NULL AND v_start IS NOT NULL AND v_due <= v_start THEN
    RAISE EXCEPTION 'update_assignment: due_at must be after start_at' USING ERRCODE = '22023';
  END IF;

  UPDATE public.assignments SET
    title = COALESCE(NULLIF(trim(p_title), ''), title),
    instructions = COALESCE(NULLIF(p_instructions, ''), instructions),
    start_at = COALESCE(p_start_at, start_at),
    due_at = COALESCE(p_due_at, due_at)
  WHERE id = p_assignment_id;

  RETURN QUERY SELECT * FROM public.assignments WHERE id = p_assignment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_assignment(p_assignment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_class_id UUID;
BEGIN
  SELECT classroom_id INTO v_class_id FROM public.assignments WHERE id = p_assignment_id;
  IF v_class_id IS NULL THEN
    RAISE EXCEPTION 'delete_assignment: assignment not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_class_teacher(v_class_id) THEN
    RAISE EXCEPTION 'delete_assignment: caller is not a teacher here' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.assignments WHERE id = p_assignment_id;
END;
$$;

-- Student accepts a deck assignment: creates the student's OWN copy of the
-- teacher's deck (definer reads the source, writes only rows owned by the
-- caller), idempotently. Returns the local deck id for navigation.
CREATE OR REPLACE FUNCTION public.accept_class_deck(p_assignment_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_assignment RECORD;
  v_local_deck_id UUID;
  v_local_title TEXT;
BEGIN
  SELECT id, classroom_id, kind, deck_id, deck_title
  INTO v_assignment
  FROM public.assignments WHERE id = p_assignment_id;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'accept_class_deck: assignment not found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_class_member(v_assignment.classroom_id) THEN
    RAISE EXCEPTION 'accept_class_deck: caller is not a member of this class' USING ERRCODE = '42501';
  END IF;
  IF v_assignment.kind <> 'deck' OR v_assignment.deck_id IS NULL THEN
    RAISE EXCEPTION 'accept_class_deck: assignment is not a deck assignment' USING ERRCODE = '22000';
  END IF;

  -- Idempotent: reuse an existing local copy if the student already accepted.
  SELECT local_deck_id INTO v_local_deck_id
  FROM public.assignment_progress
  WHERE assignment_id = p_assignment_id AND user_id = v_uid;

  IF v_local_deck_id IS NULL THEN
    v_local_title := COALESCE(v_assignment.deck_title, 'Assigned deck') || ' (Class)';
    INSERT INTO public.decks (user_id, name, description, is_public, original_deck_id)
    VALUES (v_uid, v_local_title, 'Auto-copied from a class assignment', FALSE, v_assignment.deck_id)
    RETURNING id INTO v_local_deck_id;

    INSERT INTO public.cards (user_id, deck_id, front, back, source_type, trust_score, verified)
    SELECT v_uid, v_local_deck_id, front, back, COALESCE(source_type, 'classroom'), trust_score, verified
    FROM public.cards
    WHERE deck_id = v_assignment.deck_id;
  END IF;

  INSERT INTO public.assignment_progress (assignment_id, classroom_id, user_id, local_deck_id, status)
  VALUES (p_assignment_id, v_assignment.classroom_id, v_uid, v_local_deck_id, 'assigned')
  ON CONFLICT (assignment_id, user_id) DO UPDATE
    SET local_deck_id = EXCLUDED.local_deck_id;

  RETURN jsonb_build_object(
    'deck_id', v_local_deck_id,
    'title', COALESCE(v_local_title, (SELECT name FROM public.decks WHERE id = v_local_deck_id))
  );
END;
$$;

-- Student records progress. For kind='deck', stats are computed from the
-- student's own card_reviews / study_sessions against their local deck copy.
-- For kind='quiz', the client supplies correct/total.
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
  SELECT id, classroom_id, kind, start_at, created_at
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
    -- quiz: client-supplied score is the source of truth
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

-- ============================================================
-- 6. Grants — revoke from anon/PUBLIC (the lock-down must hold as
--    it did for every SECURITY DEFINER function before us), then
--    hand EXECUTE to authenticated explicitly.
-- ============================================================

REVOKE ALL ON FUNCTION public.is_class_member(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_class_member(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_class_teacher(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_class_teacher(UUID) TO authenticated;

-- generate_class_invite_code is an internal helper; not exposed as an RPC.
REVOKE ALL ON FUNCTION public.generate_class_invite_code() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.create_classroom(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_classroom(TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.update_classroom(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_classroom(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_classroom(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_classroom(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.refresh_class_invite_code(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.refresh_class_invite_code(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.join_classroom_with_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_classroom_with_code(TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.leave_classroom(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_classroom(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.remove_classroom_member(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_classroom_member(UUID, UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.set_class_member_role(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_class_member_role(UUID, UUID, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.classroom_roster(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.classroom_roster(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.create_assignment(UUID, TEXT, TEXT, TEXT, UUID, JSONB, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_assignment(UUID, TEXT, TEXT, TEXT, UUID, JSONB, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

REVOKE ALL ON FUNCTION public.update_assignment(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_assignment(UUID, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_assignment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_assignment(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.accept_class_deck(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_class_deck(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.record_assignment_progress(UUID, UUID, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_assignment_progress(UUID, UUID, INTEGER, INTEGER) TO authenticated;

-- ============================================================
-- 7. Bookkeeping
-- ============================================================
INSERT INTO schema_migrations (version, description)
VALUES (
  '20260919000000_classroom_portal',
  'Classroom Portal: classrooms, classroom_memberships (teacher/student), assignments (deck/quiz), assignment_progress. All writes via SECURITY DEFINER RPCs; RLS SELECT only; anon fully locked out.'
)
ON CONFLICT (version) DO NOTHING;