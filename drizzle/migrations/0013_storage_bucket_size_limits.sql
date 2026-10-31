-- Enforce storage object limits at the Supabase Storage layer, not only in UI/RPC validation.
-- Keep digital files private and cap image uploads independently.
DO $$
BEGIN
  IF (SELECT count(*) FROM storage.buckets WHERE id IN ('product-files', 'product-images')) <> 2 THEN
    RAISE EXCEPTION 'required_storage_buckets_missing';
  END IF;
END $$;

UPDATE storage.buckets
   SET file_size_limit = 52428800,
       public = false
 WHERE id = 'product-files';

UPDATE storage.buckets
   SET file_size_limit = 10485760
 WHERE id = 'product-images';
