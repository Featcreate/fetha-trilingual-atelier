-- Sellers should not query the full orders row through PostgREST.
-- Their dashboard now uses an authenticated server function that returns only
-- their own order_items and non-sensitive order metadata.
DROP POLICY IF EXISTS "Sellers read orders containing their items" ON public.orders;

-- This helper existed only to support the seller-wide orders policy.
DROP FUNCTION IF EXISTS public.current_user_sells_order(uuid);
