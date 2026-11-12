-- Keep the free-plan per-file cap at 50 MiB while retaining the 1 GiB per-store quota.
-- The private bucket accepts every MIME type; authorization remains enforced by Storage RLS.
-- Supabase's project-wide Storage limit still applies and may be lower than this bucket ceiling.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'product-files') THEN
    RAISE EXCEPTION 'product_files_bucket_missing';
  END IF;
END $$;

UPDATE storage.buckets
   SET file_size_limit = 52428800,
       allowed_mime_types = NULL,
       public = false
 WHERE id = 'product-files';

CREATE OR REPLACE FUNCTION public.register_file_version(
  _product_id uuid,
  _file_name text,
  _size_bytes bigint,
  _mime_type text,
  _sha256 text
)
RETURNS TABLE (version_id uuid, upload_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  _store uuid;
  _id uuid;
  _path text;
  _used_bytes bigint;
  _store_limit constant bigint := 1073741824;
  _file_limit constant bigint := 52428800;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF _size_bytes IS NULL OR _size_bytes < 1 OR _size_bytes > _file_limit THEN
    RAISE EXCEPTION 'file_size_limit_exceeded';
  END IF;
  IF NOT public.is_email_verified(auth.uid()) THEN
    RAISE EXCEPTION 'email_verification_required';
  END IF;

  -- Serialize quota checks for a seller by locking their store row.
  SELECT s.id INTO _store
    FROM public.products p
    JOIN public.stores s ON s.id = p.store_id
   WHERE p.id = _product_id
     AND s.owner_id = auth.uid()
     AND s.status = 'active'
   FOR UPDATE OF s;

  IF _store IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT coalesce(sum(v.size_bytes), 0)
    INTO _used_bytes
    FROM public.product_file_versions v
   WHERE v.store_id = _store;

  IF _used_bytes + _size_bytes > _store_limit THEN
    RAISE EXCEPTION 'storage_quota_exceeded';
  END IF;

  INSERT INTO public.product_file_versions (
    product_id, store_id, file_name, size_bytes, mime_type, sha256, storage_path, created_by
  )
  VALUES (
    _product_id,
    _store,
    _file_name,
    _size_bytes,
    coalesce(nullif(_mime_type, ''), 'application/octet-stream'),
    nullif(lower(_sha256), ''),
    'pending',
    auth.uid()
  )
  RETURNING id, storage_path INTO _id, _path;

  RETURN QUERY SELECT _id, _path;
END;
$$;

COMMENT ON FUNCTION public.register_file_version(uuid, text, bigint, text, text)
  IS 'Registers one private digital product file, enforcing up to 50 MiB per file and 1 GiB total stored bytes per seller store. All MIME types are accepted; the Supabase project-wide Storage limit still applies.';
