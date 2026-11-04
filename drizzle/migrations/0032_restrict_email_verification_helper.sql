-- This helper is called only from SECURITY DEFINER routines owned by postgres.
-- It is not a client-facing RPC and must not be callable by signed-in users.
REVOKE EXECUTE ON FUNCTION public.is_email_verified(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_email_verified(uuid) TO service_role;
