-- Public identity images are isolated from product previews and private downloads.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('store-assets', 'store-assets', true, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.stores
  ADD COLUMN logo_path text,
  ADD COLUMN avatar_path text,
  ADD COLUMN banner_path text;

CREATE POLICY "Anyone reads public store identity assets"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'store-assets');

CREATE POLICY "Owners upload own store identity assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'store-assets'
    AND EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id::text = split_part(storage.objects.name, '/', 1)
        AND s.owner_id = auth.uid() AND s.status = 'active'
        AND storage.objects.name ~ ('^' || s.id::text || '/(logo|avatar|banner)-[0-9a-f-]+[.](jpg|jpeg|png|webp|avif)$')
    )
  );

CREATE POLICY "Owners replace own store identity assets"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'store-assets'
    AND EXISTS (SELECT 1 FROM public.stores s
      WHERE s.id::text = split_part(storage.objects.name, '/', 1)
        AND s.owner_id = auth.uid() AND s.status = 'active')
  )
  WITH CHECK (
    bucket_id = 'store-assets'
    AND EXISTS (SELECT 1 FROM public.stores s
      WHERE s.id::text = split_part(storage.objects.name, '/', 1)
        AND s.owner_id = auth.uid() AND s.status = 'active')
  );

CREATE POLICY "Owners delete own store identity assets"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'store-assets'
    AND EXISTS (SELECT 1 FROM public.stores s
      WHERE s.id::text = split_part(storage.objects.name, '/', 1)
        AND s.owner_id = auth.uid())
  );
