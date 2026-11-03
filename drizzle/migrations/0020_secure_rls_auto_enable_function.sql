-- Keep the RLS auto-enable event trigger while preventing direct API invocation
-- of its SECURITY DEFINER helper through anon/authenticated RPC.
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
