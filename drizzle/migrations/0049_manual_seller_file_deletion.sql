-- Manual seller deletion safety.
-- File archival and checkout snapshots serialize on the product row. The
-- checkout trigger rechecks the version after acquiring that lock, so a
-- concurrent deletion cannot leave a newly purchased snapshot without a file.

CREATE OR REPLACE FUNCTION public.archive_file_version(_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _product_id uuid;
  _owner_id uuid;
  _product_active boolean;
  _version_status text;
  _active_count integer;
BEGIN
  SELECT pv.product_id, s.owner_id, p.is_active, pv.status
    INTO _product_id, _owner_id, _product_active, _version_status
    FROM public.product_file_versions pv
    JOIN public.stores s ON s.id = pv.store_id
    JOIN public.products p ON p.id = pv.product_id
   WHERE pv.id = _version_id;

  IF NOT FOUND OR (_owner_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  PERFORM p.id
    FROM public.products p
   WHERE p.id = _product_id
   FOR UPDATE;

  SELECT p.is_active INTO _product_active
    FROM public.products p
   WHERE p.id = _product_id;

  SELECT pv.status INTO _version_status
    FROM public.product_file_versions pv
   WHERE pv.id = _version_id;

  IF _version_status = 'archived' THEN
    RETURN;
  END IF;

  SELECT count(*) INTO _active_count
    FROM public.product_file_versions pv
   WHERE pv.product_id = _product_id
     AND pv.status = 'active';

  IF _version_status = 'active' AND _product_active AND _active_count <= 1 THEN
    RAISE EXCEPTION 'file_last_active_version';
  END IF;

  UPDATE public.product_file_versions pv
     SET status = 'archived', archived_at = now()
   WHERE pv.id = _version_id
     AND pv.status IN ('pending_upload', 'active');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'file_version_not_archivable';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_file_version(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_file_version(uuid) TO service_role;


-- Checkout snapshots must reference a currently active version with a real
-- Storage object. Locking the product row serializes this check with archival.
CREATE OR REPLACE FUNCTION public.guard_order_item_file_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _product_id uuid;
  _version_status text;
  _storage_path text;
  _file_name text;
  _size_bytes bigint;
BEGIN
  SELECT i.product_id, v.status, v.storage_path, v.file_name, v.size_bytes
    INTO _product_id, _version_status, _storage_path, _file_name, _size_bytes
    FROM public.order_items i
    JOIN public.product_file_versions v
      ON v.id = NEW.file_version_id
     AND v.product_id = i.product_id
   WHERE i.id = NEW.order_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_file_snapshot';
  END IF;

  PERFORM p.id
    FROM public.products p
   WHERE p.id = _product_id
   FOR UPDATE;

  SELECT v.status, v.storage_path, v.file_name, v.size_bytes
    INTO _version_status, _storage_path, _file_name, _size_bytes
    FROM public.product_file_versions v
   WHERE v.id = NEW.file_version_id
     AND v.product_id = _product_id;

  IF NOT FOUND OR _version_status <> 'active' THEN
    RAISE EXCEPTION 'file_version_unavailable';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM storage.objects o
     WHERE o.bucket_id = 'product-files'
       AND o.name = _storage_path
  ) THEN
    RAISE EXCEPTION 'file_storage_object_missing';
  END IF;

  NEW.storage_path := _storage_path;
  NEW.file_name := _file_name;
  NEW.size_bytes := _size_bytes;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_order_item_file_snapshot() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS order_item_files_guard_snapshot ON public.order_item_files;
CREATE TRIGGER order_item_files_guard_snapshot
BEFORE INSERT ON public.order_item_files
FOR EACH ROW
EXECUTE FUNCTION public.guard_order_item_file_snapshot();


-- Recompute seller quota from retained versions. Immutable metadata remains,
-- but a version with a successful manual-deletion audit no longer consumes
-- the seller's application quota.
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
SET search_path = ''
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
   WHERE v.store_id = _store
     AND NOT EXISTS (
       SELECT 1
         FROM public.storage_cleanup_audit a
        WHERE a.file_version_id = v.id
          AND a.decision = 'deleted'
     );

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

REVOKE ALL ON FUNCTION public.register_file_version(uuid, text, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_file_version(uuid, text, bigint, text, text) TO service_role;
