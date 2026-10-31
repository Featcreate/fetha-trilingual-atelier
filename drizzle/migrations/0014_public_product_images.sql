-- Product previews are public catalogue assets; downloadable product files remain private.
-- Only store owners may upload image objects under their own product namespace.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'product-images') THEN
    RAISE EXCEPTION 'product_images_bucket_missing';
  END IF;
END $$;

UPDATE storage.buckets
   SET public = true,
       file_size_limit = 10485760,
       allowed_mime_types = ARRAY[
         'image/jpeg',
         'image/png',
         'image/webp',
         'image/gif',
         'image/avif'
       ]
 WHERE id = 'product-images';

CREATE POLICY "Sellers upload own product images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND EXISTS (
      SELECT 1
        FROM public.products p
        JOIN public.stores s ON s.id = p.store_id
       WHERE s.owner_id = auth.uid()
         AND s.status = 'active'
         AND storage.objects.name LIKE s.id::text || '/' || p.id::text || '/%'
    )
  );
