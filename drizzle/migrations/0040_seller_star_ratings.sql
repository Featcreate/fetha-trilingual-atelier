-- Verified buyers can rate each active store once. Ratings are aggregate-public only.
CREATE TABLE public.seller_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, reviewer_id)
);
CREATE INDEX seller_ratings_store_idx ON public.seller_ratings(store_id, stars);
ALTER TABLE public.seller_ratings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.seller_ratings FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.seller_ratings TO authenticated;
CREATE POLICY "Buyers read own seller ratings" ON public.seller_ratings
  FOR SELECT TO authenticated USING (reviewer_id = (SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.submit_seller_rating(_store_id uuid, _stars integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _reviewer uuid := auth.uid();
BEGIN
  IF _reviewer IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _stars IS NULL OR _stars < 1 OR _stars > 5 THEN RAISE EXCEPTION 'invalid_rating'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    JOIN public.stores s ON s.id = oi.store_id
    WHERE oi.store_id = _store_id AND o.user_id = _reviewer
      AND o.status = 'paid' AND o.payment_mode = 'verified' AND s.status = 'active'
  ) THEN RAISE EXCEPTION 'verified_purchase_required'; END IF;
  INSERT INTO public.seller_ratings (store_id, reviewer_id, stars)
  VALUES (_store_id, _reviewer, _stars)
  ON CONFLICT (store_id, reviewer_id)
  DO UPDATE SET stars = EXCLUDED.stars, updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.submit_seller_rating(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_seller_rating(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_top_rated_stores()
RETURNS TABLE (
  store_id uuid, store_name text, store_slug text, logo_path text,
  avatar_path text, average_rating numeric, rating_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name, s.slug, s.logo_path, s.avatar_path,
         round(avg(r.stars)::numeric, 2), count(*)::bigint
  FROM public.stores s JOIN public.seller_ratings r ON r.store_id = s.id
  WHERE s.status = 'active'
  GROUP BY s.id, s.name, s.slug, s.logo_path, s.avatar_path
  ORDER BY avg(r.stars) DESC, count(*) DESC, s.created_at ASC
  LIMIT 10;
$$;
REVOKE ALL ON FUNCTION public.get_top_rated_stores() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_top_rated_stores() TO anon, authenticated;
