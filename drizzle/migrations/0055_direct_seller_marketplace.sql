-- Direct-to-seller marketplace launch model.
-- Additive and backward-compatible: historical provider-paid orders and ledgers remain intact.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE RESTRICT;

-- Backfill only unambiguous historical orders. Mixed-store historical orders stay NULL.
UPDATE public.orders o
SET store_id = x.store_id
FROM (
  SELECT order_id, min(store_id::text)::uuid AS store_id
  FROM public.order_items
  WHERE store_id IS NOT NULL
  GROUP BY order_id
  HAVING count(DISTINCT store_id) = 1
) x
WHERE o.id = x.order_id AND o.store_id IS NULL;

CREATE INDEX IF NOT EXISTS orders_store_idx ON public.orders(store_id, created_at DESC);

-- Seller-configured payment instructions. Details are visible only to the owner;
-- buyers receive them through an order-scoped RPC after creating an order.
CREATE TABLE IF NOT EXISTS public.store_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  method_type text NOT NULL CHECK (method_type IN ('bank_transfer','postal_transfer','wallet','cash','other')),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 80),
  instructions text NOT NULL CHECK (length(trim(instructions)) BETWEEN 1 AND 2000),
  is_enabled boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS store_payment_methods_store_idx
  ON public.store_payment_methods(store_id, is_enabled, display_order);
ALTER TABLE public.store_payment_methods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.store_payment_methods FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_payment_methods TO authenticated;
CREATE POLICY "Sellers manage own store payment methods"
  ON public.store_payment_methods FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = (SELECT auth.uid())));

-- Buyer can read payment instructions only for their own pending order.
CREATE OR REPLACE FUNCTION public.get_order_payment_methods(_order_id uuid)
RETURNS TABLE(method_id uuid, method_type text, label text, instructions text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT pm.id, pm.method_type, pm.label, pm.instructions
  FROM public.orders o
  JOIN public.store_payment_methods pm ON pm.store_id = o.store_id AND pm.is_enabled
  WHERE o.id = _order_id
    AND o.user_id = (SELECT auth.uid())
    AND o.status = 'pending'
    AND o.store_id IS NOT NULL
  ORDER BY pm.display_order, pm.created_at;
$$;
REVOKE ALL ON FUNCTION public.get_order_payment_methods(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_order_payment_methods(uuid) TO authenticated;

-- One order is permanently scoped to exactly one store.
CREATE OR REPLACE FUNCTION public.create_order_from_cart(_items jsonb, _checkout_key text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing uuid;
  _existing_fingerprint text;
  _order uuid;
  _line_count integer;
  _valid_count integer;
  _total bigint;
  _fingerprint text;
  _store_count integer;
  _store_id uuid;
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

  SELECT count(DISTINCT p.store_id), min(p.store_id::text)::uuid,
         count(*), coalesce(sum(coalesce(p.sale_price_millimes, p.price_millimes)::bigint), 0)
    INTO _store_count, _store_id, _valid_count, _total
  FROM jsonb_array_elements(_items) AS x(value)
  JOIN public.products p ON p.id = (x.value->>'productId')::uuid
  JOIN public.stores s ON s.id = p.store_id
  WHERE p.is_active AND s.status = 'active'
    AND EXISTS (SELECT 1 FROM public.product_file_versions v
                WHERE v.product_id = p.id AND v.status = 'active');
  IF _valid_count <> _line_count THEN RAISE EXCEPTION 'product_unavailable'; END IF;
  IF _store_count <> 1 OR _store_id IS NULL THEN RAISE EXCEPTION 'cart_must_contain_one_store'; END IF;
  IF _total < 1 OR _total > 2000000000 THEN RAISE EXCEPTION 'invalid_cart'; END IF;

  SELECT id, cart_fingerprint INTO _existing, _existing_fingerprint
  FROM public.orders WHERE user_id = _uid AND checkout_key = _checkout_key;
  IF _existing IS NOT NULL THEN
    IF _existing_fingerprint IS DISTINCT FROM _fingerprint THEN RAISE EXCEPTION 'checkout_key_cart_mismatch'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = _existing AND o.store_id = _store_id) THEN
      RAISE EXCEPTION 'legacy_order_store_mismatch';
    END IF;
    RETURN _existing;
  END IF;

  SELECT id INTO _existing FROM public.orders
  WHERE user_id = _uid AND cart_fingerprint = _fingerprint
    AND status = 'pending' AND store_id = _store_id
  LIMIT 1;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

  INSERT INTO public.orders (user_id, customer_email, total_millimes, checkout_key, cart_fingerprint, store_id, payment_mode)
  VALUES (_uid, (SELECT email FROM auth.users WHERE id = _uid), _total::integer, _checkout_key, _fingerprint, _store_id, 'direct_seller')
  RETURNING id INTO _order;

  INSERT INTO public.order_items (
    order_id, product_id, product_name, unit_price_millimes, store_id, seller_id, quantity,
    gross_millimes, discount_millimes, payable_millimes, commission_bps, commission_millimes, seller_net_millimes
  )
  SELECT _order, p.id, p.name, p.price_millimes, s.id, s.owner_id, 1,
         p.price_millimes, (p.price_millimes - coalesce(p.sale_price_millimes, p.price_millimes)),
         coalesce(p.sale_price_millimes, p.price_millimes), 0, 0,
         coalesce(p.sale_price_millimes, p.price_millimes)
  FROM jsonb_array_elements(_items) AS x(value)
  JOIN public.products p ON p.id = (x.value->>'productId')::uuid
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

-- Seller confirmation is the only transition that marks a direct-pay order paid.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_mode_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_mode_check
  CHECK (payment_mode IS NULL OR payment_mode IN ('verified','simulation','direct_seller'));

ALTER TABLE public.payment_events DROP CONSTRAINT IF EXISTS payment_events_payment_mode_check;
ALTER TABLE public.payment_events ADD CONSTRAINT payment_events_payment_mode_check
  CHECK (payment_mode IS NULL OR payment_mode IN ('verified','simulation','direct_seller'));

CREATE OR REPLACE FUNCTION public.seller_confirm_direct_payment(_order_id uuid, _confirmation_note text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _order public.orders%ROWTYPE;
  _seller uuid := auth.uid();
  _now timestamptz := now();
BEGIN
  IF _seller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT * INTO _order FROM public.orders
  WHERE id = _order_id AND store_id IN (SELECT s.id FROM public.stores s WHERE s.owner_id = _seller)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'forbidden_or_order_missing'; END IF;
  IF _order.status = 'paid' AND _order.payment_mode = 'direct_seller' THEN RETURN 'already_confirmed'; END IF;
  IF _order.status <> 'pending' THEN RETURN 'order_closed'; END IF;
  IF _order.payment_mode IS DISTINCT FROM 'direct_seller' THEN RAISE EXCEPTION 'not_direct_seller_order'; END IF;
  IF _order.store_id IS NULL THEN RAISE EXCEPTION 'order_store_missing'; END IF;
  IF _confirmation_note IS NOT NULL AND length(_confirmation_note) > 200 THEN RAISE EXCEPTION 'invalid_confirmation_note'; END IF;

  UPDATE public.orders
  SET status = 'paid',
      paid_at = _now,
      payment_mode = 'direct_seller',
      payment_confirmation_ref = 'seller:' || _seller::text
  WHERE id = _order_id;

  INSERT INTO public.download_entitlements (order_id, order_item_file_id, user_id, starts_at, expires_at)
  SELECT _order.id, f.id, _order.user_id, _now, _now + interval '7 days'
  FROM public.order_item_files f
  JOIN public.order_items i ON i.id = f.order_item_id
  WHERE i.order_id = _order.id
  ON CONFLICT (order_item_file_id) DO NOTHING;

  INSERT INTO public.payment_events (order_id, payment_ref, source, outcome, payment_mode)
  VALUES (_order.id, 'seller:' || _seller::text, 'seller_confirmation', 'paid', 'direct_seller');
  RETURN 'paid';
END;
$$;
REVOKE ALL ON FUNCTION public.seller_confirm_direct_payment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seller_confirm_direct_payment(uuid, text) TO authenticated;

-- Keep platform monetization controls available but disabled at launch.
UPDATE public.platform_settings SET commission_bps = 0 WHERE id = true;
