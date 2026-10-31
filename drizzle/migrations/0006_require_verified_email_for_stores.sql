-- Enforce verified email at the database boundary for seller store creation.
-- This migration is additive: it replaces one INSERT policy and adds a narrowly scoped helper.
CREATE OR REPLACE FUNCTION public.current_user_email_is_confirmed()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users AS u
    WHERE u.id = (SELECT auth.uid())
      AND u.email_confirmed_at IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.current_user_email_is_confirmed() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_email_is_confirmed() TO authenticated, service_role;

DROP POLICY "Users open own active store" ON public.stores;
CREATE POLICY "Verified users open own active store" ON public.stores
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND status = 'active'
    AND (SELECT public.current_user_email_is_confirmed())
  );
