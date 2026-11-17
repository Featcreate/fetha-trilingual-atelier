-- The approved launch commission is 10% for new orders only.
ALTER TABLE public.platform_settings ALTER COLUMN commission_bps SET DEFAULT 1000;
UPDATE public.platform_settings SET commission_bps = 1000, updated_at = now()
WHERE id = true AND commission_bps IS DISTINCT FROM 1000;

-- Centralized manual buyer collection for Algorea Bazaar.
-- The buyer pays once to the platform; seller accounting is posted only by the
-- existing verified, transactional settle_order_payment() routine.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_reference text
    NOT NULL DEFAULT ('AB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  ADD COLUMN IF NOT EXISTS payment_method text
    CHECK (payment_method IS NULL OR payment_method IN ('flouci', 'bank_transfer', 'postal_transfer')),
  ADD COLUMN IF NOT EXISTS payment_beneficiary_snapshot text,
  ADD COLUMN IF NOT EXISTS payment_account_identifier_snapshot text,
  ADD COLUMN IF NOT EXISTS payment_instructions_snapshot text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_reference_uidx
  ON public.orders(order_reference);

COMMENT ON COLUMN public.orders.order_reference IS
  'Buyer-facing unique Algorea Bazaar order reference; does not expose a personal beneficiary name.';
COMMENT ON COLUMN public.orders.payment_method IS
  'Selected centralized platform collection method. Seller-specific payment is not supported.';

CREATE TABLE IF NOT EXISTS public.platform_payment_methods (
  method text PRIMARY KEY CHECK (method IN ('flouci', 'bank_transfer', 'postal_transfer')),
  beneficiary_label text NOT NULL DEFAULT 'Algorea Bazaar'
    CHECK (beneficiary_label = 'Algorea Bazaar'),
  account_identifier text NOT NULL DEFAULT '',
  instructions text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.platform_payment_methods(method, beneficiary_label, account_identifier, instructions, enabled)
VALUES
  ('flouci', 'Algorea Bazaar', '', 'Paiement Flouci — confirmation manuelle après vérification.', false),
  ('bank_transfer', 'Algorea Bazaar', '', 'Virement bancaire — confirmation manuelle après vérification.', false),
  ('postal_transfer', 'Algorea Bazaar', '', 'Mandat ou virement postal — confirmation manuelle après vérification.', false)
ON CONFLICT (method) DO NOTHING;

ALTER TABLE public.platform_payment_methods ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_payment_methods FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.platform_payment_methods TO anon, authenticated;
GRANT ALL ON public.platform_payment_methods TO service_role;

CREATE POLICY "Buyers read enabled platform payment methods"
  ON public.platform_payment_methods FOR SELECT TO anon, authenticated
  USING (enabled = true);

CREATE POLICY "Admins read all platform payment methods"
  ON public.platform_payment_methods FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_upsert_platform_payment_method(
  _method text, _account_identifier text, _instructions text, _enabled boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _method NOT IN ('flouci', 'bank_transfer', 'postal_transfer')
     OR _account_identifier IS NULL OR length(trim(_account_identifier)) > 200
     OR _instructions IS NULL OR length(trim(_instructions)) > 1000
     OR (_enabled = true AND length(trim(_account_identifier)) = 0) THEN
    RAISE EXCEPTION 'invalid_payment_method_configuration';
  END IF;
  INSERT INTO public.platform_payment_methods(
    method, beneficiary_label, account_identifier, instructions, enabled, updated_at, updated_by
  ) VALUES (
    _method, 'Algorea Bazaar', trim(_account_identifier), trim(_instructions), _enabled, now(), auth.uid()
  )
  ON CONFLICT (method) DO UPDATE SET
    beneficiary_label = 'Algorea Bazaar',
    account_identifier = EXCLUDED.account_identifier,
    instructions = EXCLUDED.instructions,
    enabled = EXCLUDED.enabled,
    updated_at = now(),
    updated_by = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.set_order_platform_payment_method(
  _order_id uuid, _method text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _order public.orders%ROWTYPE;
  _method_row public.platform_payment_methods%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _method NOT IN ('flouci', 'bank_transfer', 'postal_transfer') THEN
    RAISE EXCEPTION 'invalid_payment_method';
  END IF;
  SELECT * INTO _order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR _order.user_id <> auth.uid() THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF _order.status <> 'pending' THEN RAISE EXCEPTION 'order_closed'; END IF;
  IF _order.ipay_payment_ref IS NOT NULL OR _order.konnect_payment_ref IS NOT NULL THEN
    RAISE EXCEPTION 'order_has_provider_payment';
  END IF;
  IF _order.payment_method IS NOT NULL THEN
    IF _order.payment_method = _method THEN RETURN true; END IF;
    RAISE EXCEPTION 'payment_method_already_selected';
  END IF;
  SELECT * INTO _method_row FROM public.platform_payment_methods
  WHERE method = _method AND enabled = true;
  IF NOT FOUND OR length(trim(_method_row.account_identifier)) = 0 THEN
    RAISE EXCEPTION 'payment_method_unavailable';
  END IF;
  UPDATE public.orders
  SET payment_method = _method,
      payment_beneficiary_snapshot = 'Algorea Bazaar',
      payment_account_identifier_snapshot = _method_row.account_identifier,
      payment_instructions_snapshot = _method_row.instructions
  WHERE id = _order_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_confirm_manual_order_payment(
  _order_id uuid, _amount_millimes integer, _transfer_reference text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _order public.orders%ROWTYPE;
  _reference text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _amount_millimes IS NULL OR _amount_millimes <= 0
     OR _transfer_reference IS NULL
     OR length(trim(_transfer_reference)) NOT BETWEEN 3 AND 200 THEN
    RAISE EXCEPTION 'invalid_payment_confirmation';
  END IF;

  SELECT * INTO _order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown_order'; END IF;
  IF _order.status = 'paid' THEN
    IF _order.payment_mode = 'verified'
       AND _order.payment_confirmation_ref = ('manual:' || _order.payment_method || ':' || trim(_transfer_reference)) THEN
      RETURN 'already_paid';
    END IF;
    RAISE EXCEPTION 'order_already_paid_with_different_reference';
  END IF;
  IF _order.status <> 'pending' THEN RAISE EXCEPTION 'order_closed'; END IF;
  IF _order.payment_method IS NULL THEN RAISE EXCEPTION 'payment_method_missing'; END IF;
  IF _amount_millimes <> _order.total_millimes THEN RAISE EXCEPTION 'payment_amount_mismatch'; END IF;

  _reference := 'manual:' || _order.payment_method || ':' || trim(_transfer_reference);
  RETURN public.settle_order_payment(
    _order.id, 'verified', _reference, _amount_millimes, 'admin_manual_collection'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_platform_payment_method(text,text,text,boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_platform_payment_method(text,text,text,boolean)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_order_platform_payment_method(uuid,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_order_platform_payment_method(uuid,text)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_confirm_manual_order_payment(uuid,integer,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_confirm_manual_order_payment(uuid,integer,text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_confirm_manual_order_payment(uuid,integer,text) IS
  'Admin-only manual collection confirmation. Validates exact amount and posts downloads, seller payables and platform commission through the existing idempotent settlement transaction.';


-- Service-role-only actor wrappers: application handlers pass the verified session user.
CREATE OR REPLACE FUNCTION public.server_set_order_platform_payment_method(
  _actor_id uuid, _order_id uuid, _method text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF _actor_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor_id, 'role', 'authenticated')::text, true);
  RETURN public.set_order_platform_payment_method(_order_id, _method);
END;
$$;

CREATE OR REPLACE FUNCTION public.server_admin_upsert_platform_payment_method(
  _actor_id uuid, _method text, _account_identifier text, _instructions text, _enabled boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF _actor_id IS NULL OR NOT public.has_role(_actor_id, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor_id, 'role', 'authenticated')::text, true);
  PERFORM public.admin_upsert_platform_payment_method(_method, _account_identifier, _instructions, _enabled);
END;
$$;

CREATE OR REPLACE FUNCTION public.server_admin_confirm_manual_order_payment(
  _actor_id uuid, _order_id uuid, _amount_millimes integer, _transfer_reference text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF _actor_id IS NULL OR NOT public.has_role(_actor_id, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor_id, 'role', 'authenticated')::text, true);
  RETURN public.admin_confirm_manual_order_payment(_order_id, _amount_millimes, _transfer_reference);
END;
$$;

REVOKE ALL ON FUNCTION public.server_set_order_platform_payment_method(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.server_admin_upsert_platform_payment_method(uuid,text,text,text,boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.server_admin_confirm_manual_order_payment(uuid,uuid,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.server_set_order_platform_payment_method(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_admin_upsert_platform_payment_method(uuid,text,text,text,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_admin_confirm_manual_order_payment(uuid,uuid,integer,text) TO service_role;

-- Seller payout requests are requests for review, never automatic transfers.
CREATE TABLE IF NOT EXISTS public.seller_payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  available_amount_millimes bigint NOT NULL CHECK (available_amount_millimes >= 50000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','fulfilled')),
  payout_id uuid REFERENCES public.seller_payouts(id) ON DELETE RESTRICT,
  seller_note text NOT NULL DEFAULT '' CHECK (length(seller_note) <= 1000),
  admin_note text NOT NULL DEFAULT '' CHECK (length(admin_note) <= 1000),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS seller_payout_requests_one_pending_per_store
  ON public.seller_payout_requests(store_id) WHERE status IN ('pending','approved');
CREATE INDEX IF NOT EXISTS seller_payout_requests_seller_created_idx
  ON public.seller_payout_requests(seller_id, created_at DESC);

ALTER TABLE public.seller_payout_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.seller_payout_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.seller_payout_requests TO authenticated;
GRANT ALL ON public.seller_payout_requests TO service_role;

CREATE POLICY "Sellers read own payout requests"
  ON public.seller_payout_requests FOR SELECT TO authenticated
  USING (seller_id = (SELECT auth.uid()));
CREATE POLICY "Admins read all payout requests"
  ON public.seller_payout_requests FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));


-- An approved request is required before an admin can reserve seller proceeds.
-- The request is fulfilled atomically when its manual payout batch is created.
CREATE OR REPLACE FUNCTION public.guard_seller_payout_requires_approved_request()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.seller_payout_requests r
    WHERE r.store_id = NEW.store_id AND r.status = 'approved' AND r.payout_id IS NULL
  ) THEN
    RAISE EXCEPTION 'payout_request_not_approved';
  END IF;
  RETURN NEW;
END;
$;

CREATE OR REPLACE FUNCTION public.fulfill_seller_payout_request()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $
DECLARE
  _request_id uuid;
BEGIN
  SELECT r.id INTO _request_id
  FROM public.seller_payout_requests r
  WHERE r.store_id = NEW.store_id AND r.status = 'approved' AND r.payout_id IS NULL
  ORDER BY r.reviewed_at, r.created_at
  LIMIT 1
  FOR UPDATE;
  IF _request_id IS NULL THEN RAISE EXCEPTION 'payout_request_not_approved'; END IF;

  UPDATE public.seller_payout_requests
  SET status = 'fulfilled', payout_id = NEW.id, updated_at = now()
  WHERE id = _request_id;
  RETURN NEW;
END;
$;

CREATE TRIGGER seller_payout_requires_approved_request
  BEFORE INSERT ON public.seller_payouts
  FOR EACH ROW EXECUTE FUNCTION public.guard_seller_payout_requires_approved_request();

CREATE TRIGGER seller_payout_fulfills_approved_request
  AFTER INSERT ON public.seller_payouts
  FOR EACH ROW EXECUTE FUNCTION public.fulfill_seller_payout_request();

REVOKE ALL ON FUNCTION public.guard_seller_payout_requires_approved_request() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fulfill_seller_payout_request() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.submit_seller_payout_request(
  _store_id uuid, _seller_note text DEFAULT ''
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _seller uuid := auth.uid();
  _available bigint;
  _unallocated_fees bigint;
  _request_id uuid;
BEGIN
  IF _seller IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF length(coalesce(_seller_note,'')) > 1000 THEN RAISE EXCEPTION 'invalid_seller_note'; END IF;
  PERFORM 1 FROM public.stores WHERE id = _store_id AND owner_id = _seller AND status = 'active' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'store_not_found'; END IF;

  SELECT coalesce(sum(le.amount_millimes),0) INTO _available
  FROM public.seller_ledger_entries le
  JOIN public.order_items oi ON oi.id = le.order_item_id
  JOIN public.orders o ON o.id = oi.order_id
  WHERE le.store_id = _store_id AND le.seller_id = _seller AND le.entry_type = 'sale_net'
    AND o.status = 'paid' AND o.payment_mode = 'verified'
    AND NOT EXISTS (SELECT 1 FROM public.seller_payout_items pi WHERE pi.ledger_entry_id = le.id);
  SELECT coalesce(sum(f.amount_millimes - coalesce(a.allocated, 0)), 0)
    INTO _unallocated_fees
  FROM public.seller_external_fee_entries f
  LEFT JOIN LATERAL (
    SELECT sum(x.amount_millimes) AS allocated
    FROM public.seller_payout_fee_allocations x
    WHERE x.fee_entry_id = f.id
  ) a ON true
  WHERE f.store_id = _store_id
    AND f.fee_category = 'seller_transfer'
    AND f.amount_millimes > coalesce(a.allocated, 0);
  _available := _available - _unallocated_fees;
  IF _available < 50000 THEN RAISE EXCEPTION 'payout_minimum_not_met'; END IF;

  INSERT INTO public.seller_payout_requests(store_id, seller_id, available_amount_millimes, seller_note)
  VALUES (_store_id, _seller, _available, coalesce(_seller_note,''))
  RETURNING id INTO _request_id;
  RETURN _request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_review_seller_payout_request(
  _request_id uuid, _decision text, _admin_note text DEFAULT ''
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _decision NOT IN ('approved','rejected') OR length(coalesce(_admin_note,'')) > 1000 THEN
    RAISE EXCEPTION 'invalid_review';
  END IF;
  UPDATE public.seller_payout_requests
  SET status = _decision, admin_note = coalesce(_admin_note,''), reviewed_by = auth.uid(),
      reviewed_at = now(), updated_at = now()
  WHERE id = _request_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'payout_request_not_pending'; END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_seller_payout_request(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_seller_payout_request(uuid,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_review_seller_payout_request(uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_seller_payout_request(uuid,text,text) TO authenticated, service_role;


-- A manual bank/postal/Flouci transfer reference may settle at most one order.
CREATE UNIQUE INDEX IF NOT EXISTS orders_manual_payment_reference_uidx
  ON public.orders(payment_confirmation_ref)
  WHERE payment_mode = 'verified' AND payment_confirmation_ref LIKE 'manual:%';

-- Snapshot promotional prices on the server. Commission is calculated on the
-- discounted payable amount; gross and discount remain separately auditable.
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
  PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text || ':' || _checkout_key, 0));
  SELECT id INTO _existing FROM public.orders WHERE user_id = _uid AND checkout_key = _checkout_key;
  IF _existing IS NOT NULL THEN RETURN _existing; END IF;

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
     AND (p.sale_price_millimes IS NULL OR (p.sale_price_millimes > 0 AND p.sale_price_millimes < p.price_millimes))
     AND EXISTS (SELECT 1 FROM public.product_file_versions v
                 WHERE v.product_id = p.id AND v.status = 'active');
  IF _valid_count <> _line_count THEN RAISE EXCEPTION 'product_unavailable'; END IF;
  IF _total < 1 OR _total > 2000000000 THEN RAISE EXCEPTION 'invalid_cart'; END IF;

  INSERT INTO public.orders(user_id, customer_email, total_millimes, checkout_key)
  VALUES (_uid, (SELECT email FROM auth.users WHERE id = _uid), _total::integer, _checkout_key)
  RETURNING id INTO _order;

  WITH requested AS (
    SELECT (x.value->>'productId')::uuid AS product_id
    FROM jsonb_array_elements(_items) AS x(value)
  )
  INSERT INTO public.order_items(
    order_id, product_id, product_name, unit_price_millimes, store_id, seller_id, quantity,
    gross_millimes, discount_millimes, payable_millimes, commission_bps, commission_millimes, seller_net_millimes
  )
  SELECT _order, p.id, p.name, p.price_millimes, s.id, s.owner_id, 1,
         p.price_millimes,
         (p.price_millimes - coalesce(p.sale_price_millimes, p.price_millimes)),
         coalesce(p.sale_price_millimes, p.price_millimes),
         _bps,
         round(coalesce(p.sale_price_millimes, p.price_millimes)::numeric * _bps / 10000)::integer,
         coalesce(p.sale_price_millimes, p.price_millimes)
           - round(coalesce(p.sale_price_millimes, p.price_millimes)::numeric * _bps / 10000)::integer
    FROM requested r
    JOIN public.products p ON p.id = r.product_id
    JOIN public.stores s ON s.id = p.store_id;

  INSERT INTO public.order_item_files(order_item_id, file_version_id, storage_path, file_name, size_bytes)
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

REVOKE ALL ON FUNCTION public.create_order_from_cart(jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_from_cart(jsonb,text) TO authenticated, service_role;

