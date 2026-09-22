-- ============================================================
-- Repair card schedules written by the broken FSRS implementation.
--
-- The old client-side scheduler made intervals ~140x too long (Hard could
-- schedule 36,500 days out) and stored inflated memory states in
-- cards.fsrs_state. The client now uses the official ts-fsrs (FSRS-6); this
-- one-off repair makes existing cards safe for it:
--
--   * Reviewed cards drop the stored fsrs_state. The scheduler rebuilds it
--     from the card's interval on the next review (getFSRSState's fallback).
--   * Intervals are capped at 30 days, and any card due more than 30 days
--     out is due now. Worst case a learner reviews a card a little early.
--
-- Never-reviewed cards are untouched (their fsrs_state may carry a
-- personalised starting difficulty).
--
-- RUN-ONCE: the UPDATE is gated on the schema_migrations ledger, so
-- re-running this file cannot wipe progress made under the new scheduler.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM schema_migrations WHERE version = '20260922000000_fsrs_scheduler_repair'
  ) THEN
    UPDATE public.cards
    SET
      next_review = CASE
        WHEN next_review > now() + interval '30 days' THEN now()
        ELSE next_review
      END,
      interval = LEAST(COALESCE(interval, 0), 30),
      fsrs_state = NULL
    WHERE last_reviewed IS NOT NULL;
  END IF;
END $$;

INSERT INTO schema_migrations (version, description)
VALUES (
  '20260922000000_fsrs_scheduler_repair',
  'Reset schedules written by the broken FSRS implementation: clear reviewed cards'' fsrs_state, cap intervals at 30 days, bring far-future cards due now.'
)
ON CONFLICT (version) DO NOTHING;
