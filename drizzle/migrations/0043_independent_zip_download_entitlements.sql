-- Independent one-time ZIP entitlement alongside the existing original-file entitlement.
-- Payment settlement continues to create the original entitlement; this trigger creates its ZIP counterpart.
CREATE TABLE public.zip_download_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  order_item_file_id uuid NOT NULL UNIQUE REFERENCES public.order_item_files(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  starts_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  max_downloads integer NOT NULL DEFAULT 1 CHECK (max_downloads = 1),
  used_downloads integer NOT NULL DEFAULT 0 CHECK (used_downloads BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > starts_at)
);
CREATE INDEX zip_de_user_idx ON public.zip_download_entitlements(user_id);
ALTER TABLE public.zip_download_entitlements ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.zip_download_entitlements TO authenticated;
GRANT ALL ON public.zip_download_entitlements TO service_role;
CREATE POLICY "Buyers read own ZIP entitlements"
  ON public.zip_download_entitlements FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Admins read ZIP entitlements"
  ON public.zip_download_entitlements FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.zip_download_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL REFERENCES public.zip_download_entitlements(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','finalized','released','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 minutes'),
  finalized_at timestamptz,
  closed_at timestamptz
);
CREATE UNIQUE INDEX zip_dr_one_reserved
  ON public.zip_download_reservations(entitlement_id) WHERE status = 'reserved';
CREATE INDEX zip_dr_entitlement_idx ON public.zip_download_reservations(entitlement_id, created_at DESC);
ALTER TABLE public.zip_download_reservations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.zip_download_reservations TO authenticated;
GRANT ALL ON public.zip_download_reservations TO service_role;
CREATE POLICY "Admins read ZIP reservations"
  ON public.zip_download_reservations FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.create_zip_entitlement_for_original()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.order_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.orders o
     WHERE o.id = NEW.order_id
       AND o.status = 'paid'
       AND o.payment_mode = 'verified'
  ) THEN
    INSERT INTO public.zip_download_entitlements
      (order_id, order_item_file_id, user_id, starts_at, expires_at)
    VALUES
      (NEW.order_id, NEW.order_item_file_id, NEW.user_id, NEW.starts_at, NEW.expires_at)
    ON CONFLICT (order_item_file_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.create_zip_entitlement_for_original() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER create_zip_entitlement_after_original
  AFTER INSERT ON public.download_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.create_zip_entitlement_for_original();

INSERT INTO public.zip_download_entitlements
  (order_id, order_item_file_id, user_id, starts_at, expires_at)
SELECT de.order_id, de.order_item_file_id, de.user_id, de.starts_at, de.expires_at
FROM public.download_entitlements de
JOIN public.orders o ON o.id = de.order_id
WHERE o.status = 'paid' AND o.payment_mode = 'verified'
ON CONFLICT (order_item_file_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.reserve_zip_download(_user_id uuid, _entitlement_id uuid)
RETURNS TABLE (outcome text, reservation_id uuid, storage_path text, file_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
DECLARE e record; _rid uuid;
BEGIN
  SELECT ze.id, ze.user_id, ze.expires_at, ze.used_downloads,
         o.status AS ostatus, o.user_id AS ouser, o.payment_mode AS pm,
         f.storage_path AS sp, f.file_name AS fn
    INTO e
    FROM public.zip_download_entitlements ze
    JOIN public.orders o ON o.id = ze.order_id
    JOIN public.order_item_files f ON f.id = ze.order_item_file_id
   WHERE ze.id = _entitlement_id
   FOR UPDATE OF ze;
  IF NOT FOUND OR e.user_id <> _user_id OR e.ouser <> _user_id THEN
    RETURN QUERY SELECT 'forbidden', NULL::uuid, NULL::text, NULL::text; RETURN;
  END IF;
  IF e.ostatus <> 'paid' OR e.pm IS DISTINCT FROM 'verified' THEN
    RETURN QUERY SELECT 'not_paid', NULL::uuid, NULL::text, NULL::text; RETURN;
  END IF;
  IF e.expires_at <= now() THEN
    RETURN QUERY SELECT 'expired', NULL::uuid, NULL::text, NULL::text; RETURN;
  END IF;
  UPDATE public.zip_download_reservations
     SET status = 'expired', closed_at = now()
   WHERE entitlement_id = e.id AND status = 'reserved' AND expires_at <= now();
  IF EXISTS (
    SELECT 1 FROM public.zip_download_reservations
     WHERE entitlement_id = e.id AND status = 'reserved'
  ) THEN
    RETURN QUERY SELECT 'busy', NULL::uuid, NULL::text, NULL::text; RETURN;
  END IF;
  IF e.used_downloads >= 1 THEN
    RETURN QUERY SELECT 'quota_exhausted', NULL::uuid, NULL::text, NULL::text; RETURN;
  END IF;
  INSERT INTO public.zip_download_reservations (entitlement_id, user_id, expires_at)
  VALUES (e.id, _user_id, now() + interval '30 minutes')
  RETURNING id INTO _rid;
  RETURN QUERY SELECT 'new', _rid, e.sp, e.fn;
END $$;

CREATE OR REPLACE FUNCTION public.finalize_zip_download(_reservation_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _entitlement_id uuid;
  _entitlement_expires_at timestamptz;
  _used_downloads integer;
  _order_status text;
  _payment_mode text;
  _reservation_status text;
  _reservation_expires_at timestamptz;
BEGIN
  -- Keep the same lock order as reserve_zip_download: entitlement, order, reservation.
  -- The initial lookup is intentionally unlocked; all mutable checks are repeated
  -- after the entitlement and reservation rows have been locked.
  SELECT zr.entitlement_id
    INTO _entitlement_id
    FROM public.zip_download_reservations zr
   WHERE zr.id = _reservation_id;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT ze.expires_at, ze.used_downloads, o.status, o.payment_mode
    INTO _entitlement_expires_at, _used_downloads, _order_status, _payment_mode
    FROM public.zip_download_entitlements ze
    JOIN public.orders o ON o.id = ze.order_id
   WHERE ze.id = _entitlement_id
   FOR UPDATE OF ze, o;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT zr.status, zr.expires_at
    INTO _reservation_status, _reservation_expires_at
    FROM public.zip_download_reservations zr
   WHERE zr.id = _reservation_id
     AND zr.entitlement_id = _entitlement_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF _reservation_status = 'finalized' THEN RETURN true; END IF;
  IF _reservation_status <> 'reserved' THEN RETURN false; END IF;

  IF _order_status <> 'paid'
     OR _payment_mode IS DISTINCT FROM 'verified'
     OR _entitlement_expires_at <= now()
     OR _used_downloads <> 0 THEN
    UPDATE public.zip_download_reservations
       SET status = 'released', closed_at = now()
     WHERE id = _reservation_id AND status = 'reserved';
    RETURN false;
  END IF;

  IF _reservation_expires_at <= now() THEN
    UPDATE public.zip_download_reservations
       SET status = 'expired', closed_at = now()
     WHERE id = _reservation_id AND status = 'reserved';
    RETURN false;
  END IF;

  UPDATE public.zip_download_entitlements
     SET used_downloads = 1
   WHERE id = _entitlement_id
     AND used_downloads = 0
     AND expires_at > now();
  IF NOT FOUND THEN
    UPDATE public.zip_download_reservations
       SET status = 'released', closed_at = now()
     WHERE id = _reservation_id AND status = 'reserved';
    RETURN false;
  END IF;

  UPDATE public.zip_download_reservations
     SET status = 'finalized', finalized_at = now()
   WHERE id = _reservation_id AND status = 'reserved';
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.release_zip_download(_reservation_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.zip_download_reservations
     SET status = 'released', closed_at = now()
   WHERE id = _reservation_id AND status = 'reserved';
$$;

REVOKE ALL ON FUNCTION public.reserve_zip_download(uuid, uuid),
  public.finalize_zip_download(uuid), public.release_zip_download(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_zip_download(uuid, uuid),
  public.finalize_zip_download(uuid), public.release_zip_download(uuid)
  TO service_role;
