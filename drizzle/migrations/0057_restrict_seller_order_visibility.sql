-- Sellers must not query the complete orders row through PostgREST.
-- Their dashboard uses an authenticated server function returning only their
-- own order_items and non-sensitive order metadata.
DROP POLICY IF EXISTS "Sellers read orders containing their items" ON public.orders;

-- Older environments may contain this legacy helper, but it is not created by
-- the migration chain. Revoke it only when present; absence is expected on a
-- clean database.
DO $migration$
BEGIN
  IF to_regprocedure('public.current_user_sells_order(uuid)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.current_user_sells_order(uuid) FROM PUBLIC, anon, authenticated, service_role';
  END IF;
END
$migration$;
