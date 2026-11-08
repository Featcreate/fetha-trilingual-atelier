-- Guard Konnect initialization against concurrent retries and bind cart idempotency
-- keys to the exact canonical set of product IDs.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cart_fingerprint text,
  ADD COLUMN IF NOT EXISTS konnect_init_claimed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS orders_one_pending_cart_fingerprint
  ON public.orders(user_id, cart_fingerprint)
  WHERE status = 'pending' AND cart_fingerprint IS NOT NULL;

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

  -- Serialize different checkout keys for the same cart as well.
  PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text || ':cart:' || _fingerprint, 0));

  SELECT id, cart_fingerprint INTO _existing, _existing_fingerprint
    FROM public.orders WHERE user_id = _uid AND checkout_key = _checkout_key;
  IF _existing IS NOT NULL THEN
    IF _existing_fingerprint IS DISTINCT FROM _fingerprint THEN
      RAISE EXCEPTION 'checkout_key_cart_mismatch';
    END IF;
    RETURN _existing;
  END IF;

  -- A pending order for this exact cart must be reused even after a browser reload
  -- or a newly generated client key; never create a second charge for the same cart.
  SELECT id INTO _existing
    FROM public.orders
   WHERE user_id = _uid AND cart_fingerprint = _fingerprint AND status = 'pending'
   LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  -- If a prior provider call timed out before its reference was saved, block
  -- new cart orders for this buyer until the uncertain attempt is reconciled.
  SELECT id INTO _existing
    FROM public.orders
   WHERE user_id = _uid
     AND status = 'pending'
     AND konnect_init_claimed_at IS NOT NULL
     AND konnect_pay_url IS NULL
   LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  SELECT commission_bps INTO _bps FROM public.platform_settings WHERE id = true;
  IF _bps IS NULL THEN RAISE EXCEPTION 'commission_not_configured'; END IF;

  WITH requested AS (
    SELECT (x.value->>'productId')::uuid AS product_id
    FROM jsonb_array_elements(_items) AS x(value)
  )
  SELECT count(*), coalesce(sum(p.price_millimes::bigint), 0)
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
         p.price_millimes, 0, p.price_millimes, _bps,
         round(p.price_millimes::numeric * _bps / 10000)::integer,
         (p.price_millimes - round(p.price_millimes::numeric * _bps / 10000))::integer
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

-- Exactly one caller may cross the external-provider boundary for an order.
-- A claimed attempt is deliberately not auto-expired: a timeout can mean the
-- provider created a payment but the response was lost. Retrying could double-charge.
CREATE OR REPLACE FUNCTION public.claim_order_konnect_init(_order_id uuid)
RETURNS TABLE (outcome text, pay_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order public.orders%ROWTYPE;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _order FROM public.orders WHERE id = _order_id AND user_id = _uid FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text, NULL::text; RETURN; END IF;
  IF _order.status <> 'pending' THEN RETURN QUERY SELECT 'order_closed'::text, NULL::text; RETURN; END IF;
  IF _order.konnect_pay_url IS NOT NULL THEN
    RETURN QUERY SELECT 'existing'::text, _order.konnect_pay_url; RETURN;
  END IF;
  IF _order.konnect_payment_ref IS NOT NULL OR _order.konnect_init_claimed_at IS NOT NULL THEN
    RETURN QUERY SELECT 'in_progress'::text, NULL::text; RETURN;
  END IF;
  UPDATE public.orders SET konnect_init_claimed_at = now() WHERE id = _order_id;
  RETURN QUERY SELECT 'claimed'::text, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_order_konnect_init(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_order_konnect_init(uuid) TO authenticated, service_role;
