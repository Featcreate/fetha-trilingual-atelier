-- Sellers must not query the complete orders row through PostgREST.
-- Their dashboard uses an authenticated server function returning only their
-- own order_items and non-sensitive order metadata.
DROP POLICY IF EXISTS "Sellers read orders containing their items" ON public.orders;

-- Retain the helper for compatibility with the generated database types, but
-- remove its direct API execution grants now that the seller policy is gone.
REVOKE ALL ON FUNCTION public.current_user_sells_order(uuid) FROM PUBLIC, anon, authenticated, service_role;
