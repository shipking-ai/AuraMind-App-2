-- ============================================================
-- Classroom portal: make every write RPC-only, as the original migration
-- intended (20260919000000_classroom_portal.sql, section header).
--
-- The bug: "Teachers update assignments" had no column restriction and
-- authenticated kept table UPDATE, so a teacher could PATCH an assignment's
-- deck_id to ANY deck id — including another user's private deck — past
-- create_assignment's "you can only assign decks you own" check. Calling
-- accept_class_deck (SECURITY DEFINER) then copied that private deck's cards
-- into the caller's library. Reproduced against the live project inside a
-- rolled-back transaction on 2026-09-21.
--
-- Fix, in depth:
--   1. Drop the four direct write policies (update_classroom,
--      delete_classroom, update_assignment, delete_assignment already exist).
--   2. Revoke table write privileges from anon/authenticated so a future
--      policy can't silently reopen the hole.
--   3. accept_class_deck only copies a deck still owned by the teacher who
--      created the assignment, and only that owner's cards.
--
-- IDEMPOTENT: DROP POLICY IF EXISTS / REVOKE / CREATE OR REPLACE.
-- ============================================================

DROP POLICY IF EXISTS "Owner updates classroom" ON public.classrooms;
DROP POLICY IF EXISTS "Owner deletes classroom" ON public.classrooms;
DROP POLICY IF EXISTS "Teachers update assignments" ON public.assignments;
DROP POLICY IF EXISTS "Teachers delete assignments" ON public.assignments;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.classrooms            FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.classroom_memberships FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.assignments           FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.assignment_progress   FROM anon, authenticated;

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
  SELECT id, classroom_id, kind, deck_id, deck_title, created_by
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
  -- The definer can read any deck, so re-check what create_assignment
  -- checked: the source deck must still belong to the assigning teacher.
  IF NOT EXISTS (
    SELECT 1 FROM public.decks
    WHERE id = v_assignment.deck_id AND user_id = v_assignment.created_by
  ) THEN
    RAISE EXCEPTION 'accept_class_deck: assigned deck is not owned by the assigning teacher' USING ERRCODE = '42501';
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
    WHERE deck_id = v_assignment.deck_id
      AND user_id = v_assignment.created_by;
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

REVOKE ALL ON FUNCTION public.accept_class_deck(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_class_deck(UUID) TO authenticated;

INSERT INTO schema_migrations (version, description)
VALUES (
  '20260921000000_classroom_rpc_only_writes',
  'Classroom portal: drop direct write policies, revoke table writes, accept_class_deck copies only the assigning teacher''s own deck.'
)
ON CONFLICT (version) DO NOTHING;
