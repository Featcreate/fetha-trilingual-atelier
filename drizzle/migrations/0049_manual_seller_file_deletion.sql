-- Manual seller deletion safety.
-- Checkout and file archival serialize on the product row so a checkout cannot
-- snapshot an archived file while its Storage object is being removed.

CREATE OR REPLACE FUNCTION public.archive_file_version(_version_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _product_id uuid;
  _owner_id uuid;
BEGIN
  SELECT pv.product_id, s.owner_id
    INTO _product_id, _owner_id
    FROM public.product_file_versions pv
    JOIN public.stores s ON s.id = pv.store_id
   WHERE pv.id = _version_id;

  IF NOT FOUND OR (_owner_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Same lock order as checkout: product first, then file version.
  PERFORM p.id FROM public.products p
   WHERE p.id = _product_id
   FOR UPDATE;

  UPDATE public.product_file_versions pv
     SET status = 'archived', archived_at = now()
   WHERE pv.id = _version_id
     AND pv.status <> 'archived';

  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_order_from_cart(_items jsonb, _checkout_key text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing uuid;
  _existing_fingerprint text;
  _order uuid;
  _line_count integer;
  _valid_count integer;
  _total bigint;
  _bps integer;
  _fingerprint text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _checkout_key IS NULL OR length(_checkout_key) < 8 OR length(_checkout_key) > 100 THEN
    RAISE EXCEPTION 'invalid_checkout_key';
  END IF;
  IF jsonb_typeof(_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_cart'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text || ':key:' || _checkout_key, 0));

  SELECT count(*) INTO _line_count FROM jsonb_array_elements(_items);
  IF _line_count < 1 OR _line_count > 50 THEN RAISE EXCEPTION 'invalid_cart'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_items) AS x(value)
    WHERE jsonb_typeof(x.value) <> 'object'
       OR coalesce(x.value->>'productId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR coalesce(x.value->>'quantity', '') <> '1'
  ) THEN RAISE EXCEPTION 'invalid_cart'; END IF;
  IF (SELECT count(DISTINCT (x.value->>'productId')::uuid)
      FROM jsonb_array_elements(_items) AS x(value)) <> _line_count THEN
    RAISE EXCEPTION 'invalid_cart';
  END IF;

  SELECT md5(string_agg(product_id::text, ',' ORDER BY product_id::text))
    INTO _fingerprint
    FROM (SELECT (x.value->>'productId')::uuid AS product_id
          FROM jsonb_array_elements(_items) AS x(value)) requested;

  PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text || ':cart:' || _fingerprint, 0));

  SELECT id, cart_fingerprint INTO _existing, _existing_fingerprint
    FROM public.orders WHERE user_id = _uid AND checkout_key = _checkout_key;
  IF _existing IS NOT NULL THEN
    IF _existing_fingerprint IS DISTINCT FROM _fingerprint THEN
      RAISE EXCEPTION 'checkout_key_cart_mismatch';
    END IF;
    RETURN _existing;
  END IF;

  SELECT id INTO _existing
    FROM public.orders
   WHERE user_id = _uid AND cart_fingerprint = _fingerprint AND status = 'pending'
   LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  SELECT id INTO _existing
    FROM public.orders
   WHERE user_id = _uid
     AND status = 'pending'
     AND konnect_init_claimed_at IS NOT NULL
     AND konnect_pay_url IS NULL
   LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  -- Serialize checkout against seller archival/deletion for every requested product.
  PERFORM p.id
    FROM public.products p
    JOIN (
      SELECT (x.value->>'productId')::uuid AS product_id
        FROM jsonb_array_elements(_items) AS x(value)
    ) requested ON requested.product_id = p.id
   ORDER BY p.id
   FOR UPDATE OF p;

  SELECT commission_bps INTO _bps FROM public.platform_settings WHERE id = true;
  IF _bps IS NULL THEN RAISE EXCEPTION 'commission_not_configured'; END IF;

  WITH requested AS (
    SELECT (x.value->>'productId')::uuid AS product_id
    FROM jsonb_array_elements(_items) AS x(value)
  )
  SELECT count(*), coalesce(sum(coalesce(p.sale_price_millimes, p.price_millimes)::bigint), 0)
    INTO _valid_count, _total
    FROM requested r
    JOIN public.products p ON p.id = r.product_id
    JOIN public.stores s ON s.id = p.store_id
   WHERE p.is_active AND s.status = 'active'
     AND EXISTS (SELECT 1 FROM public.product_file_versions v
                 WHERE v.product_id = p.id AND v.status = 'active');
  IF _valid_count <> _line_count THEN RAISE EXCEPTION 'product_unavailable'; END IF;
  IF _total < 1 OR _total > 2000000000 THEN RAISE EXCEPTION 'invalid_cart'; END IF;

  INSERT INTO public.orders (user_id, customer_email, total_millimes, checkout_key, cart_fingerprint)
  VALUES (_uid, (SELECT email FROM auth.users WHERE id = _uid), _total::integer, _checkout_key, _fingerprint)
  RETURNING id INTO _order;

  WITH requested AS (
    SELECT (x.value->>'productId')::uuid AS product_id
    FROM jsonb_array_elements(_items) AS x(value)
  )
  INSERT INTO public.order_items (
    order_id, product_id, product_name, unit_price_millimes, store_id, seller_id, quantity,
    gross_millimes, discount_millimes, payable_millimes, commission_bps, commission_millimes, seller_net_millimes
  )
  SELECT _order, p.id, p.name, p.price_millimes, s.id, s.owner_id, 1,
         p.price_millimes::integer,
         (p.price_millimes - coalesce(p.sale_price_millimes, p.price_millimes))::integer,
         coalesce(p.sale_price_millimes, p.price_millimes)::integer, _bps,
         round(coalesce(p.sale_price_millimes, p.price_millimes)::numeric * _bps / 10000)::integer,
         (coalesce(p.sale_price_millimes, p.price_millimes) -
          round(coalesce(p.sale_price_millimes, p.price_millimes)::numeric * _bps / 10000))::integer
    FROM requested r
    JOIN public.products p ON p.id = r.product_id
    JOIN public.stores s ON s.id = p.store_id;

  INSERT INTO public.order_item_files (order_item_id, file_version_id, storage_path, file_name, size_bytes)
  SELECT i.id, v.id, v.storage_path, v.file_name, v.size_bytes
    FROM public.order_items i
    JOIN public.product_file_versions v ON v.product_id = i.product_id AND v.status = 'active'
   WHERE i.order_id = _order;

  IF (SELECT sum(payable_millimes)::bigint FROM public.order_items WHERE order_id = _order) <> _total THEN
    RAISE EXCEPTION 'total_mismatch';
  END IF;
  RETURN _order;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_from_cart(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_from_cart(jsonb, text) TO authenticated, service_role;


-- Keep the legacy single-product checkout path under the same serialization rule.
CREATE OR REPLACE FUNCTION public.create_order(_product_ids uuid[], _checkout_key text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing uuid;
  _order uuid;
  _count integer;
  _found integer;
  _total bigint;
  _bps integer;
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

  PERFORM p.id FROM public.products p
   WHERE p.id = ANY(_product_ids)
   ORDER BY p.id
   FOR UPDATE OF p;

  SELECT count(*), coalesce(sum(p.price_millimes), 0) INTO _found, _total
    FROM public.products p
    JOIN public.stores s ON s.id = p.store_id
   WHERE p.id = ANY(_product_ids)
     AND p.is_active
     AND s.status = 'active'
     AND EXISTS (SELECT 1 FROM public.product_file_versions v
                  WHERE v.product_id = p.id AND v.status = 'active');
  IF _found <> _count THEN RAISE EXCEPTION 'product_unavailable'; END IF;
  IF _total > 2000000000 THEN RAISE EXCEPTION 'invalid_cart'; END IF;

  INSERT INTO public.orders (user_id, customer_email, total_millimes, checkout_key)
  VALUES (_uid, (SELECT email FROM auth.users WHERE id = _uid), _total, _checkout_key)
  RETURNING id INTO _order;

  INSERT INTO public.order_items (
    order_id, product_id, product_name, unit_price_millimes, store_id, seller_id, quantity,
    gross_millimes, discount_millimes, payable_millimes, commission_bps, commission_millimes, seller_net_millimes
  )
  SELECT _order, p.id, p.name, p.price_millimes, s.id, s.owner_id, 1,
         p.price_millimes, 0, p.price_millimes, _bps,
         round(p.price_millimes::numeric * _bps / 10000)::integer,
         p.price_millimes - round(p.price_millimes::numeric * _bps / 10000)::integer
    FROM public.products p
    JOIN public.stores s ON s.id = p.store_id
   WHERE p.id = ANY(_product_ids);

  INSERT INTO public.order_item_files (order_item_id, file_version_id, storage_path, file_name, size_bytes)
  SELECT i.id, v.id, v.storage_path, v.file_name, v.size_bytes
    FROM public.order_items i
    JOIN public.product_file_versions v ON v.product_id = i.product_id AND v.status = 'active'
   WHERE i.order_id = _order;

  IF (SELECT sum(payable_millimes)::bigint FROM public.order_items WHERE order_id = _order) <> _total THEN
    RAISE EXCEPTION 'total_mismatch';
  END IF;
  RETURN _order;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(uuid[], text) TO authenticated, service_role;
