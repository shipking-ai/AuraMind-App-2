-- Device push tokens for server-sent reminders (FCM).
--
-- THE SHAPE OF THE ROLLOUT
--
-- The Android client registers its FCM token and upserts it here the moment
-- push is enabled in settings. The server side that READS this table (a
-- scheduled sender using the FCM HTTP v1 API) does not exist yet, and no
-- Firebase credentials are configured — so today this table only fills.
-- That is intentional: when google-services.json lands and the sender ships,
-- every opted-in device is already registered and nothing client-side
-- changes.
--
-- One row per token, not per user: reinstalls mint fresh FCM tokens, and a
-- stale unique violation would silently drop the new one. last_seen_at lets
-- the future sender prune dead tokens instead of shouting into the void.
--
-- Idempotent: table + constraint created conditionally, policies dropped
-- before recreation.

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique,
  platform text not null default 'android',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists push_tokens_user_id_idx
  on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

-- A device token authenticates its owner for NOTHING except receiving that
-- owner's pushes, so owner-only access is the whole policy. There is deliberately
-- no service-role bypass needed here: the future sender uses the service key.
drop policy if exists "Owners manage their push tokens" on public.push_tokens;
create policy "Owners manage their push tokens"
  on public.push_tokens
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

INSERT INTO schema_migrations (version, description)
VALUES (
  '20260911000000_push_tokens',
  'Add push_tokens (one row per FCM device token, owner-only RLS)'
)
ON CONFLICT (version) DO NOTHING;
