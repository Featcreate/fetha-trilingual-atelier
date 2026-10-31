-- Keep the platform commission configurable, with 5% as the initial default.
-- Administrators can change it later through admin_set_commission_bps().
UPDATE public.platform_settings
   SET commission_bps = 500, updated_by = NULL, updated_at = now()
 WHERE id = true AND commission_bps IS NULL;

ALTER TABLE public.platform_settings
  ALTER COLUMN commission_bps SET DEFAULT 500,
  ALTER COLUMN commission_bps SET NOT NULL;

CREATE OR REPLACE FUNCTION public.admin_set_commission_bps(_bps integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _bps IS NOT NULL AND (_bps < 0 OR _bps > 10000) THEN
    RAISE EXCEPTION 'invalid_commission';
  END IF;
  UPDATE public.platform_settings
     SET commission_bps = _bps, updated_by = auth.uid(), updated_at = now()
   WHERE id = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_settings_missing'; END IF;
END $$;

-- New orders cannot be created until the platform explicitly configures its commission.
CREATE OR REPLACE FUNCTION public.create_order(_product_ids uuid[], _checkout_key text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing uuid;
  _order uuid;
  _count int;
  _found int;
  _total bigint;
  _bps int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _checkout_key IS NULL OR length(_checkout_key) < 8 OR length(_checkout_key) > 100 THEN
    RAISE EXCEPTION 'invalid_checkout_key';
  END IF;

  SELECT commission_bps INTO _bps FROM public.platform_settings WHERE id = true;
  IF _bps IS NULL THEN RAISE EXCEPTION 'commission_not_configured'; END IF;

  SELECT id INTO _existing FROM public.orders WHERE user_id = _uid AND checkout_key = _checkout_key;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  SELECT count(DISTINCT x) INTO _count FROM unnest(_product_ids) x;
  IF _count = 0 OR _count > 50 THEN RAISE EXCEPTION 'invalid_cart'; END IF;

  SELECT count(*), coalesce(sum(p.price_millimes), 0) INTO _found, _total
    FROM public.products p
    JOIN public.stores s ON s.id = p.store_id
   WHERE p.id = ANY(_product_ids)
     AND p.is_active
     AND s.status = 'active'
     AND EXISTS (
       SELECT 1 FROM public.product_file_versions v
        WHERE v.product_id = p.id AND v.status = 'active'
     );
  IF _found <> _count THEN RAISE EXCEPTION 'product_unavailable'; END IF;
  IF _total > 2000000000 THEN RAISE EXCEPTION 'invalid_cart'; END IF;

  INSERT INTO public.orders (user_id, customer_email, total_millimes, checkout_key)
  VALUES (_uid, (SELECT email FROM auth.users WHERE id = _uid), _total, _checkout_key)
  RETURNING id INTO _order;

  INSERT INTO public.order_items (
    order_id, product_id, product_name, unit_price_millimes, store_id, seller_id, quantity,
    gross_millimes, discount_millimes, payable_millimes, commission_bps, commission_millimes, seller_net_millimes
  )
  SELECT
    _order, p.id, p.name, p.price_millimes, s.id, s.owner_id, 1,
    c.gross, 0, c.gross, _bps, c.comm, c.gross - c.comm
  FROM public.products p
  JOIN public.stores s ON s.id = p.store_id
  CROSS JOIN LATERAL (
    SELECT p.price_millimes AS gross,
           round(p.price_millimes::numeric * _bps / 10000)::int AS comm
  ) c
  WHERE p.id = ANY(_product_ids);

  INSERT INTO public.order_item_files (order_item_id, file_version_id, storage_path, file_name, size_bytes)
  SELECT i.id, v.id, v.storage_path, v.file_name, v.size_bytes
    FROM public.order_items i
    JOIN public.product_file_versions v ON v.product_id = i.product_id AND v.status = 'active'
   WHERE i.order_id = _order;

  IF (SELECT sum(payable_millimes) FROM public.order_items WHERE order_id = _order) <> _total THEN
    RAISE EXCEPTION 'total_mismatch';
  END IF;
  RETURN _order;
END $$;

REVOKE ALL ON FUNCTION public.create_order(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(uuid[], text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_set_commission_bps(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_commission_bps(integer) TO authenticated, service_role;

-- Immutable evidence of the Terms of Use version accepted at account creation.
CREATE TABLE public.terms_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_version text NOT NULL,
  terms_language text NOT NULL CHECK (terms_language IN ('fr', 'ar', 'en')),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, terms_version)
);
ALTER TABLE public.terms_acceptances ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.terms_acceptances TO authenticated;
GRANT ALL ON public.terms_acceptances TO service_role;
CREATE POLICY "Users read own terms acceptances"
  ON public.terms_acceptances FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "Admins read terms acceptances"
  ON public.terms_acceptances FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.require_terms_acceptance_on_signup()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _meta jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
BEGIN
  IF _meta->>'accepted_terms' IS DISTINCT FROM 'true'
     OR _meta->>'terms_version' IS DISTINCT FROM '2026-10-31-ar-v1'
     OR coalesce(_meta->>'terms_language', '') NOT IN ('fr', 'ar', 'en') THEN
    RAISE EXCEPTION 'terms_acceptance_required';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.record_terms_acceptance_on_signup()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.terms_acceptances (user_id, terms_version, terms_language)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'terms_version',
    NEW.raw_user_meta_data->>'terms_language'
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS require_terms_acceptance_before_signup ON auth.users;
CREATE TRIGGER require_terms_acceptance_before_signup
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.require_terms_acceptance_on_signup();

DROP TRIGGER IF EXISTS record_terms_acceptance_after_signup ON auth.users;
CREATE TRIGGER record_terms_acceptance_after_signup
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.record_terms_acceptance_on_signup();

REVOKE ALL ON FUNCTION public.require_terms_acceptance_on_signup() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_terms_acceptance_on_signup() FROM PUBLIC, anon, authenticated;
