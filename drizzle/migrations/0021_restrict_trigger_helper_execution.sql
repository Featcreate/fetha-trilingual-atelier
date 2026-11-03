-- Restrict SECURITY DEFINER helpers that are only invoked by database triggers.
-- Keep has_role available to authenticated users because RLS policies depend on it,
-- but do not expose role checks to anonymous visitors.
REVOKE ALL ON FUNCTION public.guard_seller_payout_item() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_seller_payout_preference() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
