-- Additional public preview images. Downloadable assets remain in private product-files.
CREATE TABLE public.product_preview_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  sort_order smallint NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 4),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT product_preview_images_path CHECK (
    storage_path LIKE product_id::text || '/%' OR storage_path LIKE '%/' || product_id::text || '/%'
  )
);

CREATE INDEX product_preview_images_product_order_idx
  ON public.product_preview_images(product_id, sort_order, created_at);

ALTER TABLE public.product_preview_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view previews of active products"
  ON public.product_preview_images FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p JOIN public.stores s ON s.id = p.store_id
    WHERE p.id = product_id AND p.is_active = true AND s.status = 'active'
  ));

CREATE POLICY "Sellers manage previews of own products"
  ON public.product_preview_images FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p JOIN public.stores s ON s.id = p.store_id
    WHERE p.id = product_id AND s.owner_id = auth.uid() AND s.status = 'active'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.products p JOIN public.stores s ON s.id = p.store_id
    WHERE p.id = product_id AND s.owner_id = auth.uid() AND s.status = 'active'
  ));

CREATE OR REPLACE FUNCTION public.enforce_product_preview_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE current_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.product_id::text, 0));
  SELECT count(*) INTO current_count
    FROM public.product_preview_images
   WHERE product_id = NEW.product_id AND id <> COALESCE(NEW.id, gen_random_uuid());
  IF current_count >= 5 THEN
    RAISE EXCEPTION 'product_preview_limit_exceeded';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_preview_images_limit
BEFORE INSERT OR UPDATE OF product_id ON public.product_preview_images
FOR EACH ROW EXECUTE FUNCTION public.enforce_product_preview_limit();

CREATE POLICY "Sellers delete own product preview objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1 FROM public.products p JOIN public.stores s ON s.id = p.store_id
      WHERE s.owner_id = auth.uid()
        AND storage.objects.name LIKE s.id::text || '/' || p.id::text || '/previews/%'
    )
  );
