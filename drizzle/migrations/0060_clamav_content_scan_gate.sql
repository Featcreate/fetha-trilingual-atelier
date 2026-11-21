-- Content-based malware scanning gate powered by ephemeral GitHub Actions runners.
-- Existing files are queued for scanning before public listing or new checkout access.
ALTER TABLE public.product_file_versions
  ADD COLUMN IF NOT EXISTS scan_status text NOT NULL DEFAULT 'pending'
    CHECK (scan_status IN ('pending', 'scanning', 'clean', 'infected', 'error')),
  ADD COLUMN IF NOT EXISTS scan_attempts integer NOT NULL DEFAULT 0 CHECK (scan_attempts >= 0),
  ADD COLUMN IF NOT EXISTS scan_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS scanned_at timestamptz,
  ADD COLUMN IF NOT EXISTS scanned_sha256 text CHECK (scanned_sha256 IS NULL OR scanned_sha256 ~ '^[0-9a-f]{64}$'),
  ADD COLUMN IF NOT EXISTS scan_error_code text;

CREATE INDEX IF NOT EXISTS product_file_versions_scan_queue_idx
  ON public.product_file_versions (scan_status, created_at)
  WHERE scan_status IN ('pending', 'scanning');

-- Executables and application packages are permitted again: content scanning,
-- not filename extensions, decides whether a file may become available.
DROP TRIGGER IF EXISTS reject_executable_product_file_version
  ON public.product_file_versions;

-- Existing active files are not trusted automatically. They remain stored, but
-- the public catalogue and checkout are gated until each has a clean scan.
UPDATE public.product_file_versions
   SET scan_status = 'pending',
       scan_started_at = NULL,
       scanned_at = NULL,
       scanned_sha256 = NULL,
       scan_error_code = NULL
 WHERE scan_status <> 'pending';

CREATE OR REPLACE FUNCTION public.activate_file_version(_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v record;
BEGIN
  SELECT pv.* INTO v
    FROM product_file_versions pv
    JOIN stores s ON s.id = pv.store_id
   WHERE pv.id = _version_id
     AND (
       (s.owner_id = auth.uid() AND s.status = 'active')
       OR public.has_role(auth.uid(), 'admin')
     )
   FOR UPDATE OF pv;

  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF v.status <> 'pending_upload' THEN RAISE EXCEPTION 'not_pending'; END IF;
  IF v.scan_status <> 'clean' THEN RAISE EXCEPTION 'file_scan_not_clean'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM storage.objects o
     WHERE o.bucket_id = 'product-files'
       AND o.name = v.storage_path
       AND (o.metadata->>'size')::bigint = v.size_bytes
  ) THEN
    RAISE EXCEPTION 'upload_missing_or_size_mismatch';
  END IF;

  UPDATE product_file_versions
     SET status = 'active', activated_at = now()
   WHERE id = _version_id;
END;
$$;

-- Claim at most one file atomically. A stale lease can be reclaimed after
-- 15 minutes if a runner disappears; no file is ever deleted by this process.
CREATE OR REPLACE FUNCTION public.claim_next_product_file_scan()
RETURNS TABLE (
  version_id uuid,
  storage_path text,
  file_name text,
  size_bytes bigint,
  sha256 text,
  created_by uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT v.id
      FROM public.product_file_versions v
     WHERE v.status IN ('pending_upload', 'active')
       AND (
         v.scan_status = 'pending'
         OR (v.scan_status = 'scanning' AND v.scan_started_at < now() - interval '15 minutes')
       )
     ORDER BY v.created_at, v.id
     FOR UPDATE SKIP LOCKED
     LIMIT 1
  ),
  claimed AS (
    UPDATE public.product_file_versions v
       SET scan_status = 'scanning',
           scan_attempts = v.scan_attempts + 1,
           scan_started_at = now(),
           scan_error_code = NULL
      FROM candidate c
     WHERE v.id = c.id
     RETURNING v.id, v.storage_path, v.file_name, v.size_bytes, v.sha256, v.created_by
  )
  SELECT c.id, c.storage_path, c.file_name, c.size_bytes, c.sha256, c.created_by
    FROM claimed c;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_product_file_scan(
  _version_id uuid,
  _result text,
  _scanned_sha256 text DEFAULT NULL,
  _error_code text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v record;
  final_result text := _result;
BEGIN
  IF _result NOT IN ('clean', 'infected', 'error') THEN
    RAISE EXCEPTION 'invalid_scan_result';
  END IF;
  IF _scanned_sha256 IS NOT NULL AND lower(_scanned_sha256) !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_scan_digest';
  END IF;

  SELECT pv.id, pv.status, pv.scan_status, pv.sha256, pv.created_by
    INTO v
    FROM public.product_file_versions pv
   WHERE pv.id = _version_id
   FOR UPDATE;

  IF NOT FOUND OR v.scan_status <> 'scanning' THEN
    RAISE EXCEPTION 'scan_lease_not_found';
  END IF;

  IF final_result = 'clean' AND v.sha256 IS NOT NULL
     AND lower(v.sha256) <> lower(coalesce(_scanned_sha256, '')) THEN
    final_result := 'error';
    _error_code := 'content_digest_mismatch';
  END IF;
  IF final_result = 'clean' AND _scanned_sha256 IS NULL THEN
    final_result := 'error';
    _error_code := 'scan_digest_missing';
  END IF;

  UPDATE public.product_file_versions
     SET scan_status = final_result,
         scanned_sha256 = CASE WHEN final_result = 'clean' THEN lower(_scanned_sha256) ELSE NULL END,
         scanned_at = now(),
         scan_error_code = CASE WHEN final_result = 'error' THEN left(coalesce(_error_code, 'scanner_error'), 80) ELSE NULL END
   WHERE id = _version_id;

  IF final_result = 'clean' AND v.status = 'pending_upload' THEN
    PERFORM set_config('request.jwt.claim.sub', v.created_by::text, true);
    PERFORM set_config(
      'request.jwt.claims',
      jsonb_build_object('sub', v.created_by, 'role', 'authenticated')::text,
      true
    );
    PERFORM public.activate_file_version(_version_id);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_next_product_file_scan() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_product_file_scan(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_next_product_file_scan() TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_product_file_scan(uuid, text, text, text) TO service_role;

-- Public product reads require at least one active, clean file version.
DROP POLICY IF EXISTS "Anyone reads listed products" ON public.products;
CREATE POLICY "Anyone reads listed products" ON public.products
  FOR SELECT TO anon, authenticated
  USING (
    is_active
    AND EXISTS (
      SELECT 1 FROM public.stores s
       WHERE s.id = products.store_id AND s.status = 'active'
    )
    AND EXISTS (
      SELECT 1 FROM public.product_file_versions v
       WHERE v.product_id = products.id
         AND v.status = 'active'
         AND v.scan_status = 'clean'
    )
  );

-- Defense in depth: even if a future checkout path forgets the scan predicate,
-- immutable purchase snapshots cannot be created from an unscanned file.
CREATE OR REPLACE FUNCTION public.guard_order_item_file_scan()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.product_file_versions v
      JOIN storage.objects o
        ON o.bucket_id = 'product-files' AND o.name = v.storage_path
     WHERE v.id = NEW.file_version_id
       AND v.status = 'active'
       AND v.scan_status = 'clean'
       AND (o.metadata->>'size')::bigint = v.size_bytes
  ) THEN
    -- A product may retain an older clean version while a replacement scans.
    -- Never snapshot the unscanned version; a deferred item-level guard below
    -- rejects checkout if no clean file remains for the purchased product.
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_item_file_scan_guard ON public.order_item_files;
CREATE TRIGGER order_item_file_scan_guard
BEFORE INSERT ON public.order_item_files
FOR EACH ROW EXECUTE FUNCTION public.guard_order_item_file_scan();

REVOKE ALL ON FUNCTION public.guard_order_item_file_scan() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_order_item_file_scan() TO service_role;

COMMENT ON COLUMN public.product_file_versions.scan_status IS
  'Content scan state. Only clean versions may be activated, publicly listed, or snapshotted into a purchase.';

CREATE OR REPLACE FUNCTION public.ensure_order_item_has_clean_file()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.order_item_files f WHERE f.order_item_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'product_file_scan_not_clean';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS order_item_requires_clean_file ON public.order_items;
CREATE CONSTRAINT TRIGGER order_item_requires_clean_file
AFTER INSERT ON public.order_items
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.ensure_order_item_has_clean_file();

REVOKE ALL ON FUNCTION public.ensure_order_item_has_clean_file() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_order_item_has_clean_file() TO service_role;
