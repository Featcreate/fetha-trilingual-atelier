-- A purchased file may be successfully downloaded once. Failed or interrupted transfers release
-- their reservation and remain retryable. The file is streamed through the authenticated app
-- server so the reservation is finalized only after the server has exhausted the file stream.

UPDATE public.download_entitlements
   SET max_downloads = greatest(used_downloads, 1);
ALTER TABLE public.download_entitlements
  ALTER COLUMN max_downloads SET DEFAULT 1;

CREATE OR REPLACE FUNCTION public.reserve_download(_user_id uuid, _entitlement_id uuid)
RETURNS TABLE (outcome text, reservation_id uuid, storage_path text, file_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE e record; _rid uuid;
BEGIN
  SELECT de.id, de.user_id, de.expires_at, de.used_downloads, de.max_downloads,
         o.status AS ostatus, o.user_id AS ouser, o.payment_mode AS pm,
         f.storage_path AS sp, f.file_name AS fn
    INTO e
    FROM download_entitlements de
    JOIN orders o ON o.id = de.order_id
    JOIN order_item_files f ON f.id = de.order_item_file_id
   WHERE de.id = _entitlement_id
   FOR UPDATE OF de;

  IF NOT FOUND OR e.user_id <> _user_id OR e.ouser <> _user_id THEN
    RETURN QUERY SELECT 'forbidden', NULL::uuid, NULL::text, NULL::text; RETURN;
  END IF;
  IF e.ostatus <> 'paid' OR e.pm IS DISTINCT FROM 'verified' THEN
    RETURN QUERY SELECT 'not_paid', NULL::uuid, NULL::text, NULL::text; RETURN;
  END IF;
  IF e.expires_at <= now() THEN
    RETURN QUERY SELECT 'expired', NULL::uuid, NULL::text, NULL::text; RETURN;
  END IF;

  UPDATE download_reservations
     SET status = 'expired', closed_at = now()
   WHERE entitlement_id = e.id AND status = 'reserved' AND expires_at <= now();

  IF EXISTS (
    SELECT 1 FROM download_reservations
     WHERE entitlement_id = e.id AND status = 'reserved'
  ) THEN
    RETURN QUERY SELECT 'busy', NULL::uuid, NULL::text, NULL::text; RETURN;
  END IF;

  -- A completed download consumes the entitlement permanently; no five-minute re-sign window.
  IF e.used_downloads >= 1 OR e.used_downloads >= e.max_downloads THEN
    RETURN QUERY SELECT 'quota_exhausted', NULL::uuid, NULL::text, NULL::text; RETURN;
  END IF;

  INSERT INTO download_reservations (entitlement_id, user_id, expires_at)
  VALUES (e.id, _user_id, now() + interval '30 minutes')
  RETURNING id INTO _rid;

  RETURN QUERY SELECT 'new', _rid, e.sp, e.fn;
END $$;

REVOKE ALL ON FUNCTION public.reserve_download(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_download(uuid, uuid) TO service_role;
