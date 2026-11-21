-- Permit a one-time legacy digest baseline only when it equals the recorded
-- clean scan digest and the underlying Storage object has not changed since scan.
CREATE OR REPLACE FUNCTION public.pfv_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'file_version_immutable'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = NEW.product_id AND p.store_id = NEW.store_id) THEN
      RAISE EXCEPTION 'file_store_mismatch';
    END IF;
    NEW.status := 'pending_upload';
    NEW.storage_path := NEW.store_id || '/' || NEW.product_id || '/' || NEW.id || '/' || NEW.file_name;
    RETURN NEW;
  END IF;

  IF NEW.sha256 IS DISTINCT FROM OLD.sha256 THEN
    IF OLD.sha256 IS NOT NULL
       OR NEW.sha256 IS NULL
       OR OLD.scan_status <> 'clean'
       OR OLD.scanned_sha256 IS NULL
       OR lower(NEW.sha256) <> lower(OLD.scanned_sha256)
       OR OLD.scanned_at IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects o
          WHERE o.bucket_id = 'product-files'
            AND o.name = OLD.storage_path
            AND (o.metadata->>'size')::bigint = OLD.size_bytes
            AND o.updated_at <= OLD.scanned_at
       ) THEN
      RAISE EXCEPTION 'file_version_immutable';
    END IF;
  END IF;

  IF (NEW.id, NEW.product_id, NEW.store_id, NEW.file_name, NEW.size_bytes, NEW.mime_type, NEW.storage_path, NEW.created_by, NEW.created_at)
     IS DISTINCT FROM (OLD.id, OLD.product_id, OLD.store_id, OLD.file_name, OLD.size_bytes, OLD.mime_type, OLD.storage_path, OLD.created_by, OLD.created_at) THEN
    RAISE EXCEPTION 'file_version_immutable';
  END IF;
  IF NEW.status <> OLD.status AND NOT ((OLD.status = 'pending_upload' AND NEW.status IN ('active','archived')) OR (OLD.status = 'active' AND NEW.status = 'archived')) THEN
    RAISE EXCEPTION 'invalid_file_status_transition';
  END IF;
  RETURN NEW;
END
$function$;

-- Require a trusted original SHA-256 and exact match with the bytes scanned by ClamAV.
-- Backfill legacy clean files only when the Storage object has not changed since scan.
UPDATE public.product_file_versions v
   SET sha256 = v.scanned_sha256
  FROM storage.objects o
 WHERE v.sha256 IS NULL
   AND v.scan_status = 'clean'
   AND v.scanned_sha256 ~ '^[0-9a-f]{64}$'
   AND o.bucket_id = 'product-files'
   AND o.name = v.storage_path
   AND (o.metadata->>'size')::bigint = v.size_bytes
   AND o.updated_at <= v.scanned_at;

UPDATE public.product_file_versions
   SET scan_status = 'error',
       scan_error_code = 'scan_digest_missing'
 WHERE scan_status = 'clean'
   AND (sha256 IS NULL OR scanned_sha256 IS NULL OR lower(sha256) <> lower(scanned_sha256));

CREATE OR REPLACE FUNCTION public.complete_product_file_scan(
  _version_id uuid, _result text, _scanned_sha256 text DEFAULT NULL, _error_code text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE v record; final_result text := _result;
BEGIN
  IF _result NOT IN ('clean', 'infected', 'error') THEN RAISE EXCEPTION 'invalid_scan_result'; END IF;
  IF _scanned_sha256 IS NOT NULL AND lower(_scanned_sha256) !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_scan_digest'; END IF;
  SELECT pv.id, pv.status, pv.scan_status, pv.sha256, pv.created_by INTO v
    FROM public.product_file_versions pv WHERE pv.id = _version_id FOR UPDATE;
  IF NOT FOUND OR v.scan_status <> 'scanning' THEN RAISE EXCEPTION 'scan_lease_not_found'; END IF;
  IF final_result = 'clean' AND _scanned_sha256 IS NULL THEN
    final_result := 'error'; _error_code := 'scan_digest_missing';
  ELSIF final_result = 'clean' AND v.sha256 IS NULL THEN
    final_result := 'error'; _error_code := 'original_digest_missing';
  ELSIF final_result = 'clean' AND lower(v.sha256) <> lower(_scanned_sha256) THEN
    final_result := 'error'; _error_code := 'content_digest_mismatch';
  END IF;
  UPDATE public.product_file_versions
     SET scan_status = final_result,
         scanned_sha256 = CASE WHEN final_result = 'clean' THEN lower(_scanned_sha256) ELSE NULL END,
         scanned_at = now(),
         scan_error_code = CASE WHEN final_result = 'error' THEN left(coalesce(_error_code, 'scanner_error'), 80) ELSE NULL END
   WHERE id = _version_id;
  IF final_result = 'clean' AND v.status = 'pending_upload' THEN
    PERFORM set_config('request.jwt.claim.sub', v.created_by::text, true);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v.created_by, 'role', 'authenticated')::text, true);
    PERFORM public.activate_file_version(_version_id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_file_version(_version_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v record;
BEGIN
  SELECT pv.* INTO v FROM product_file_versions pv
    JOIN stores s ON s.id = pv.store_id
   WHERE pv.id = _version_id
     AND ((s.owner_id = auth.uid() AND s.status = 'active') OR public.has_role(auth.uid(), 'admin'))
   FOR UPDATE OF pv;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v.status <> 'pending_upload' THEN RAISE EXCEPTION 'not_pending'; END IF;
  IF v.scan_status <> 'clean' OR v.sha256 IS NULL OR v.scanned_sha256 IS NULL OR lower(v.sha256) <> lower(v.scanned_sha256) THEN
    RAISE EXCEPTION 'file_scan_not_clean';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'product-files' AND o.name = v.storage_path AND (o.metadata->>'size')::bigint = v.size_bytes) THEN
    RAISE EXCEPTION 'upload_missing_or_size_mismatch';
  END IF;
  UPDATE product_file_versions SET status = 'active', activated_at = now() WHERE id = _version_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.product_has_clean_file(_product_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $clean$
  SELECT EXISTS (
    SELECT 1 FROM public.product_file_versions v
    JOIN public.products p ON p.id = v.product_id
    JOIN public.stores s ON s.id = p.store_id
    WHERE v.product_id = _product_id AND p.is_active AND s.status = 'active'
      AND v.status = 'active' AND v.scan_status = 'clean'
      AND v.sha256 IS NOT NULL AND v.scanned_sha256 IS NOT NULL
      AND lower(v.sha256) = lower(v.scanned_sha256)
  );
$clean$;

CREATE OR REPLACE FUNCTION public.guard_order_item_file_scan()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.product_file_versions v
    JOIN storage.objects o ON o.bucket_id = 'product-files' AND o.name = v.storage_path
    WHERE v.id = NEW.file_version_id AND v.status = 'active' AND v.scan_status = 'clean'
      AND v.sha256 IS NOT NULL AND v.scanned_sha256 IS NOT NULL
      AND lower(v.sha256) = lower(v.scanned_sha256)
      AND (o.metadata->>'size')::bigint = v.size_bytes
  ) THEN RETURN NULL; END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_product_file_scan(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_product_file_scan(uuid, text, text, text) TO service_role;
