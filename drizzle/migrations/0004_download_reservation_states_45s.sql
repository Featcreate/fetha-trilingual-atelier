DO $$ BEGIN
  IF (SELECT count(*) FROM public.download_reservations) > 0 THEN RAISE EXCEPTION 'preflight_failed: reservations not empty'; END IF;
END $$;
ALTER TABLE public.download_reservations DROP CONSTRAINT download_reservations_status_check;
ALTER TABLE public.download_reservations ALTER COLUMN status SET DEFAULT 'reserved';
ALTER TABLE public.download_reservations ADD CONSTRAINT download_reservations_status_check
  CHECK (status IN ('reserved','finalized','released','expired'));
ALTER TABLE public.download_reservations ADD COLUMN expires_at timestamptz NOT NULL DEFAULT (now() + interval '45 seconds');
DROP INDEX public.dr_one_pending;
CREATE UNIQUE INDEX dr_one_reserved ON public.download_reservations(entitlement_id) WHERE status = 'reserved';

CREATE OR REPLACE FUNCTION public.reserve_download(_user_id uuid, _entitlement_id uuid)
RETURNS TABLE (outcome text, reservation_id uuid, storage_path text, file_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE e record; _rid uuid;
BEGIN
  SELECT de.id, de.user_id, de.expires_at, de.used_downloads, de.max_downloads, o.status AS ostatus, o.user_id AS ouser,
         o.payment_mode AS pm, f.storage_path AS sp, f.file_name AS fn
    INTO e FROM download_entitlements de JOIN orders o ON o.id = de.order_id JOIN order_item_files f ON f.id = de.order_item_file_id
   WHERE de.id = _entitlement_id FOR UPDATE OF de;
  IF NOT FOUND OR e.user_id <> _user_id OR e.ouser <> _user_id THEN RETURN QUERY SELECT 'forbidden', NULL::uuid, NULL::text, NULL::text; RETURN; END IF;
  IF e.ostatus <> 'paid' OR e.pm IS NULL THEN RETURN QUERY SELECT 'not_paid', NULL::uuid, NULL::text, NULL::text; RETURN; END IF;
  IF e.expires_at <= now() THEN RETURN QUERY SELECT 'expired', NULL::uuid, NULL::text, NULL::text; RETURN; END IF;
  UPDATE download_reservations SET status = 'expired', closed_at = now()
   WHERE entitlement_id = e.id AND status = 'reserved' AND expires_at <= now();
  IF EXISTS (SELECT 1 FROM download_reservations WHERE entitlement_id = e.id AND status = 'reserved') THEN
    RETURN QUERY SELECT 'busy', NULL::uuid, NULL::text, NULL::text; RETURN;
  END IF;
  SELECT r.id INTO _rid FROM download_reservations r
   WHERE r.entitlement_id = e.id AND r.status = 'finalized' AND r.finalized_at > now() - interval '5 minutes'
   ORDER BY r.finalized_at ASC LIMIT 1;
  IF _rid IS NOT NULL THEN RETURN QUERY SELECT 'dedupe', _rid, e.sp, e.fn; RETURN; END IF;
  IF e.used_downloads >= e.max_downloads THEN RETURN QUERY SELECT 'quota_exhausted', NULL::uuid, NULL::text, NULL::text; RETURN; END IF;
  INSERT INTO download_reservations (entitlement_id, user_id, expires_at) VALUES (e.id, _user_id, now() + interval '45 seconds') RETURNING id INTO _rid;
  RETURN QUERY SELECT 'new', _rid, e.sp, e.fn;
END $$;

-- Idempotent: finalizing an already-finalized reservation returns true without counting again.
CREATE OR REPLACE FUNCTION public.finalize_download(_reservation_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT dr.id, dr.entitlement_id, dr.status, dr.expires_at INTO r FROM download_reservations dr WHERE dr.id = _reservation_id;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM download_entitlements WHERE id = r.entitlement_id FOR UPDATE;
  SELECT dr.status, dr.expires_at INTO r.status, r.expires_at FROM download_reservations dr WHERE dr.id = _reservation_id;
  IF r.status = 'finalized' THEN RETURN true; END IF;
  IF r.status <> 'reserved' THEN RETURN false; END IF;
  IF r.expires_at <= now() THEN
    UPDATE download_reservations SET status = 'expired', closed_at = now() WHERE id = _reservation_id;
    RETURN false;
  END IF;
  UPDATE download_entitlements SET used_downloads = used_downloads + 1
   WHERE id = r.entitlement_id AND expires_at > now() AND used_downloads < max_downloads;
  IF NOT FOUND THEN
    UPDATE download_reservations SET status = 'released', closed_at = now() WHERE id = _reservation_id;
    RETURN false;
  END IF;
  UPDATE download_reservations SET status = 'finalized', finalized_at = now() WHERE id = _reservation_id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.release_download(_reservation_id uuid) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE download_reservations SET status = 'released', closed_at = now() WHERE id = _reservation_id AND status = 'reserved';
$$;

REVOKE ALL ON FUNCTION public.reserve_download(uuid, uuid), public.finalize_download(uuid), public.release_download(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_download(uuid, uuid), public.finalize_download(uuid), public.release_download(uuid) TO service_role;