-- Authenticate the calls broadcast_user_notification() makes to the
-- realtime-notify edge function.
--
-- WHY
--
-- realtime-notify broadcasts a payload to any Realtime channel it is given,
-- using the service role. It is deployed without JWT verification (pg_net has
-- no user session to present), and its only other gate is an optional
-- REALTIME_WEBHOOK_SECRET that was never set, because this trigger never sent
-- one. So anyone who knew the URL could push a forged notification, links
-- included, into any user's `user:<id>:notifications` feed.
--
-- The fix is a shared secret held in Supabase Vault, read here at call time
-- and checked by the function. The value is never in this file: it is created
-- out of band with
--
--   select vault.create_secret('<random>', 'realtime_notify_secret');
--
-- and the same value is set on the function as REALTIME_WEBHOOK_SECRET.
--
-- ROLLOUT ORDER (each step keeps notifications working)
--
--   1. create the Vault secret
--   2. apply this migration: the header starts being sent; the function
--      ignores it while its own secret is unset
--   3. set REALTIME_WEBHOOK_SECRET on the function
--   4. deploy the function build that rejects requests without it
--
-- If the Vault secret is missing the header is simply omitted, so applying
-- this migration on its own can never break delivery.
--
-- Idempotent: CREATE OR REPLACE FUNCTION. Triggers are unchanged.

CREATE OR REPLACE FUNCTION public.broadcast_user_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user_id TEXT;
  v_payload JSONB;
  v_event TEXT;
  v_secret TEXT;
  v_headers JSONB := jsonb_build_object('Content-Type', 'application/json');
  v_edge_url CONSTANT TEXT := 'https://ndwiaawqkkzdsdqeglez.supabase.co/functions/v1/realtime-notify';
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'study_sessions' THEN
      v_user_id := NEW.user_id::TEXT;
      v_event := 'study_session_completed';
      v_payload := jsonb_build_object(
        'type', 'study_session',
        'event', v_event,
        'cards_studied', NEW.cards_studied,
        'duration_minutes', NEW.duration_ms / 60000,
        'accuracy', NEW.accuracy,
        'timestamp', extract(epoch from now()) * 1000
      );
    WHEN 'league_memberships' THEN
      v_user_id := NEW.user_id::TEXT;
      v_event := 'league_xp_changed';
      v_payload := jsonb_build_object(
        'type', 'league',
        'event', v_event,
        'weekly_xp', NEW.weekly_xp,
        'tier', NEW.tier,
        'league_group', NEW.league_group_id,
        'timestamp', extract(epoch from now()) * 1000
      );
    WHEN 'user_profiles' THEN
      v_user_id := NEW.user_id::TEXT;
      v_event := 'streak_updated';
      v_payload := jsonb_build_object(
        'type', 'profile',
        'event', v_event,
        'streak', NEW.streak,
        'timestamp', extract(epoch from now()) * 1000
      );
    ELSE
      RETURN NULL;
  END CASE;

  -- A notification is garnish on a write the user actually made; a Vault
  -- hiccup must never fail that write, so any error reading the secret just
  -- means the header is left off.
  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'realtime_notify_secret'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_secret := NULL;
  END;
  IF v_secret IS NOT NULL THEN
    v_headers := v_headers || jsonb_build_object('x-webhook-secret', v_secret);
  END IF;

  -- body is jsonb (pg_net >= 0.14). Do NOT cast to text.
  PERFORM net.http_post(
    url := v_edge_url,
    headers := v_headers,
    body := jsonb_build_object(
      'channel', 'user:' || v_user_id || ':notifications',
      'event', 'broadcast',
      'payload', v_payload
    ),
    timeout_milliseconds := 5000
  );

  RETURN NULL;
END;
$$;

-- Migration bookkeeping (custom ledger)
INSERT INTO schema_migrations (version, description)
VALUES (
  '20260914000000_realtime_notify_secret',
  'broadcast_user_notification() sends the Vault-held realtime-notify secret'
)
ON CONFLICT (version) DO NOTHING;
