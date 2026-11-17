-- The approved launch commission is 10% for new orders only.
UPDATE public.platform_settings SET commission_bps = 1000, updated_at = now()
WHERE id = true AND commission_bps IS DISTINCT FROM 1000;

-- Centralized manual buyer collection for Algorea Bazaar.
-- The buyer pays once to the platform; seller accounting is posted only by the
-- existing verified, transactional settle_order_payment() routine.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_reference text
    NOT NULL DEFAULT ('AB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  ADD COLUMN IF NOT EXISTS payment_method text
    CHECK (payment_method IS NULL OR payment_method IN ('flouci', 'bank_transfer', 'postal_transfer'));

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
     OR _instructions IS NULL OR length(trim(_instructions)) > 1000 THEN
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
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _method NOT IN ('flouci', 'bank_transfer', 'postal_transfer') THEN
    RAISE EXCEPTION 'invalid_payment_method';
  END IF;
  SELECT * INTO _order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR _order.user_id <> auth.uid() THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF _order.status <> 'pending' THEN RAISE EXCEPTION 'order_closed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.platform_payment_methods
    WHERE method = _method AND enabled = true
  ) THEN RAISE EXCEPTION 'payment_method_unavailable'; END IF;
  IF _order.payment_method IS NOT NULL AND _order.payment_method <> _method THEN
    RAISE EXCEPTION 'payment_method_already_selected';
  END IF;
  UPDATE public.orders SET payment_method = _method WHERE id = _order_id;
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
       AND _order.payment_confirmation_ref = trim(_transfer_reference) THEN
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
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  seller_note text NOT NULL DEFAULT '' CHECK (length(seller_note) <= 1000),
  admin_note text NOT NULL DEFAULT '' CHECK (length(admin_note) <= 1000),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS seller_payout_requests_one_pending_per_store
  ON public.seller_payout_requests(store_id) WHERE status = 'pending';
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

CREATE OR REPLACE FUNCTION public.submit_seller_payout_request(
  _store_id uuid, _seller_note text DEFAULT ''
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _seller uuid := auth.uid();
  _available bigint;
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
