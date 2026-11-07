-- Quantity-aware unified cart orders. This additive RPC keeps the existing
-- immutable order-item snapshots, per-item commission, seller ledger and payout model.
CREATE OR REPLACE FUNCTION public.create_order_from_cart(_items jsonb, _checkout_key text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing uuid;
  _order uuid;
  _line_count integer;
  _valid_count integer;
  _total bigint;
  _bps integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _checkout_key IS NULL OR length(_checkout_key) < 8 OR length(_checkout_key) > 100 THEN
    RAISE EXCEPTION 'invalid_checkout_key';
  END IF;
  IF jsonb_typeof(_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'invalid_cart'; END IF;

  -- Serialize retries using the same key before checking the unique order key.
  PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text || ':' || _checkout_key, 0));
  SELECT id INTO _existing FROM public.orders
   WHERE user_id = _uid AND checkout_key = _checkout_key;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  SELECT count(*) INTO _line_count FROM jsonb_array_elements(_items);
  IF _line_count < 1 OR _line_count > 50 THEN RAISE EXCEPTION 'invalid_cart'; END IF;

  -- Validate before casting untrusted JSON values to UUID or integer.
  IF EXISTS (
    SELECT 1
      FROM jsonb_array_elements(_items) AS x(value)
     WHERE jsonb_typeof(x.value) <> 'object'
        OR coalesce(x.value->>'productId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        OR CASE
             WHEN coalesce(x.value->>'quantity', '') ~ '^[0-9]{1,2}$'
               THEN (x.value->>'quantity')::integer NOT BETWEEN 1 AND 99
             ELSE true
           END
  ) THEN
    RAISE EXCEPTION 'invalid_cart';
  END IF;

  IF (
    SELECT count(DISTINCT (x.value->>'productId')::uuid)
      FROM jsonb_array_elements(_items) AS x(value)
  ) <> _line_count THEN
    RAISE EXCEPTION 'invalid_cart';
  END IF;

  SELECT commission_bps INTO _bps FROM public.platform_settings WHERE id = true;
  IF _bps IS NULL THEN RAISE EXCEPTION 'commission_not_configured'; END IF;

  WITH requested AS (
    SELECT (x.value->>'productId')::uuid AS product_id,
           (x.value->>'quantity')::integer AS quantity
      FROM jsonb_array_elements(_items) AS x(value)
  )
  SELECT count(*), coalesce(sum(p.price_millimes::bigint * r.quantity), 0)
    INTO _valid_count, _total
    FROM requested r
    JOIN public.products p ON p.id = r.product_id
    JOIN public.stores s ON s.id = p.store_id
   WHERE p.is_active
     AND s.status = 'active'
     AND EXISTS (
       SELECT 1 FROM public.product_file_versions v
        WHERE v.product_id = p.id AND v.status = 'active'
     );
  IF _valid_count <> _line_count THEN RAISE EXCEPTION 'product_unavailable'; END IF;
  IF _total < 1 OR _total > 2000000000 THEN RAISE EXCEPTION 'invalid_cart'; END IF;

  INSERT INTO public.orders (user_id, customer_email, total_millimes, checkout_key)
  VALUES (_uid, (SELECT email FROM auth.users WHERE id = _uid), _total::integer, _checkout_key)
  RETURNING id INTO _order;

  WITH requested AS (
    SELECT (x.value->>'productId')::uuid AS product_id,
           (x.value->>'quantity')::integer AS quantity
      FROM jsonb_array_elements(_items) AS x(value)
  )
  INSERT INTO public.order_items (
    order_id, product_id, product_name, unit_price_millimes, store_id, seller_id, quantity,
    gross_millimes, discount_millimes, payable_millimes, commission_bps, commission_millimes, seller_net_millimes
  )
  SELECT _order, p.id, p.name, p.price_millimes, s.id, s.owner_id, r.quantity,
         c.gross::integer, 0, c.gross::integer, _bps, c.commission::integer,
         (c.gross - c.commission)::integer
    FROM requested r
    JOIN public.products p ON p.id = r.product_id
    JOIN public.stores s ON s.id = p.store_id
    CROSS JOIN LATERAL (
      SELECT p.price_millimes::bigint * r.quantity AS gross,
             round((p.price_millimes::bigint * r.quantity)::numeric * _bps / 10000) AS commission
    ) c;

  INSERT INTO public.order_item_files (order_item_id, file_version_id, storage_path, file_name, size_bytes)
  SELECT i.id, v.id, v.storage_path, v.file_name, v.size_bytes
    FROM public.order_items i
    JOIN public.product_file_versions v ON v.product_id = i.product_id AND v.status = 'active'
   WHERE i.order_id = _order;

  IF (
    SELECT sum(payable_millimes)::bigint
      FROM public.order_items
     WHERE order_id = _order
  ) <> _total THEN
    RAISE EXCEPTION 'total_mismatch';
  END IF;

  RETURN _order;
END;
$$;

REVOKE ALL ON FUNCTION public.create_order_from_cart(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_from_cart(jsonb, text) TO authenticated, service_role;
