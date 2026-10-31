-- Enforce verified-email seller onboarding and a 1 GiB per-store storage quota.
-- This migration changes schema only; it does not alter production until explicitly applied.

CREATE OR REPLACE FUNCTION public.is_email_verified(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM auth.users u
     WHERE u.id = _user_id
       AND u.email_confirmed_at IS NOT NULL
  );
$$;

REVOKE ALL ON FUNCTION public.is_email_verified(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_email_verified(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users open own active store" ON public.stores;
CREATE POLICY "Verified users open own active store"
  ON public.stores FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    AND status = 'active'
    AND public.is_email_verified(auth.uid())
  );

CREATE OR REPLACE FUNCTION public.require_verified_email_for_store()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_email_verified(auth.uid()) THEN
    RAISE EXCEPTION 'email_verification_required';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stores_require_verified_email ON public.stores;
CREATE TRIGGER stores_require_verified_email
  BEFORE INSERT ON public.stores
  FOR EACH ROW
  EXECUTE FUNCTION public.require_verified_email_for_store();

REVOKE ALL ON FUNCTION public.require_verified_email_for_store() FROM PUBLIC, anon, authenticated;

-- The quota counts all stored versions, including archived versions, because those
-- objects still occupy storage until a separately audited cleanup removes them.
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

REVOKE ALL ON FUNCTION public.register_file_version(uuid, text, bigint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_file_version(uuid, text, bigint, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.register_file_version(uuid, text, bigint, text, text)
  IS 'Registers one private product file, enforcing 50 MiB per file and 1 GiB total stored bytes per seller store.';
