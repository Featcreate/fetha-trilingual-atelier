-- Role checks only need to inspect the caller's own role.
-- SECURITY INVOKER lets the user_roles RLS policy constrain the lookup to auth.uid(),
-- preventing authenticated callers from probing another user's role membership.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
     AND _user_id = (SELECT auth.uid())
     AND EXISTS (
       SELECT 1
       FROM public.user_roles ur
       WHERE ur.user_id = (SELECT auth.uid())
         AND ur.role = _role
     );
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

COMMENT ON FUNCTION public.has_role(uuid, public.app_role) IS
  'Checks only the authenticated caller own role; SECURITY INVOKER respects user_roles RLS and does not disclose other users role membership.';
