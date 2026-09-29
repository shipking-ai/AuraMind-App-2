-- Security: close the is_admin(uuid) admin oracle.
--
-- is_admin(user_uuid uuid) and is_super_admin(user_uuid uuid) take an
-- ARBITRARY uuid, so any signed-in user could probe whether a given account
-- is an admin (combine with the class-roster user ids and the oracle gets
-- practical). The only in-repo consumer of either uuid form is the
-- audit_events SELECT policy below, which always passes auth.uid() — so the
-- policy is rewritten onto current_user_is_admin() (self-contained JWT
-- app_metadata check, the same gate toggle_admin_secure and the admin API
-- already use) and EXECUTE on both uuid forms is revoked from every client
-- role. Server paths use the service role and are unaffected.
--
-- Behaviour note: an admin recognised ONLY by a legacy admin_roles-table row
-- (no app_metadata.role in the JWT) loses audit_events reads with this
-- change. Per project doctrine the JWT is canonical, so that gate is the
-- correct one — but glance at the admin list before applying.
--
-- Idempotent: DROP POLICY IF EXISTS + REVOKE of unheld grants are no-ops.

DROP POLICY IF EXISTS "Admins can read audit events" ON public.audit_events;

CREATE POLICY "Admins can read audit events"
  ON public.audit_events
  FOR SELECT
  TO authenticated
  USING (current_user_is_admin());

REVOKE ALL ON FUNCTION public.is_admin(user_uuid uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_super_admin(user_uuid uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(user_uuid uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin(user_uuid uuid) TO service_role;

-- Bookkeeping
INSERT INTO schema_migrations (version, description)
VALUES (
  '20260925_close_admin_oracle',
  'Audit policy reads via current_user_is_admin(); is_admin(uuid)/is_super_admin(uuid) revoked from client roles so signed-in users cannot probe admin status'
)
ON CONFLICT (version) DO NOTHING;
