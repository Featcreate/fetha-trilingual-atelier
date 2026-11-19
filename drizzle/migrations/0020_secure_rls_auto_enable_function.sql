-- Keep the RLS auto-enable event trigger protected when its helper exists.
-- Some Supabase environments provide this helper; a clean local database may not.
DO $migration$
BEGIN
  IF to_regprocedure('public.rls_auto_enable()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated';
  END IF;
END
$migration$;
