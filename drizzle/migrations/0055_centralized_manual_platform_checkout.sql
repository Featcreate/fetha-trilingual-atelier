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

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_method_snapshot_complete CHECK (
    (payment_method IS NULL
      AND payment_beneficiary_snapshot IS NULL
      AND payment_account_identifier_snapshot IS NULL
      AND payment_instructions_snapshot IS NULL)
    OR (payment_method IS NOT NULL
      AND payment_beneficiary_snapshot = 'Algorea Bazaar'
      AND length(trim(coalesce(payment_account_identifier_snapshot, ''))) > 0
      AND payment_instructions_snapshot IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.guard_order_payment_method_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.payment_method IS NOT NULL AND (
    NEW.payment_method IS DISTINCT FROM OLD.payment_method
    OR NEW.payment_beneficiary_snapshot IS DISTINCT FROM OLD.payment_beneficiary_snapshot
    OR NEW.payment_account_identifier_snapshot IS DISTINCT FROM OLD.payment_account_identifier_snapshot
    OR NEW.payment_instructions_snapshot IS DISTINCT FROM OLD.payment_instructions_snapshot
  ) THEN
    RAISE EXCEPTION 'order_payment_method_snapshot_immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_payment_method_snapshot_immutable
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_payment_method_snapshot();

REVOKE ALL ON FUNCTION public.guard_order_payment_method_snapshot() FROM PUBLIC, anon, authenticated;


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
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.seller_payout_requests r
    WHERE r.store_id = NEW.store_id AND r.status = 'approved' AND r.payout_id IS NULL
  ) THEN
    RAISE EXCEPTION 'payout_request_not_approved';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fulfill_seller_payout_request()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
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
$$;

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

-- Seller-facing payout preview: transfer fees are always charged to the seller,
-- never to the platform. Available balance is shown net of these fees.
CREATE OR REPLACE FUNCTION public.get_seller_payout_preview(_store_id uuid)
RETURNS TABLE (
  earned_millimes bigint,
  paid_or_reserved_millimes bigint,
  transfer_fees_millimes bigint,
  available_millimes bigint,
  minimum_millimes bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _seller uuid := auth.uid();
BEGIN
  IF _seller IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.stores s WHERE s.id = _store_id AND s.owner_id = _seller
  ) THEN
    RAISE EXCEPTION 'store_not_found';
  END IF;

  RETURN QUERY
  WITH earned AS (
    SELECT coalesce(sum(le.amount_millimes), 0)::bigint AS amount
    FROM public.seller_ledger_entries le
    JOIN public.order_items oi ON oi.id = le.order_item_id
    JOIN public.orders o ON o.id = oi.order_id
    WHERE le.store_id = _store_id AND le.seller_id = _seller
      AND le.entry_type = 'sale_net' AND o.status = 'paid' AND o.payment_mode = 'verified'
  ),
  payouts AS (
    SELECT coalesce(sum(p.seller_amount_millimes), 0)::bigint AS amount
    FROM public.seller_payouts p
    WHERE p.store_id = _store_id AND p.status <> 'cancelled'
  ),
  fees AS (
    SELECT coalesce(sum(f.amount_millimes), 0)::bigint AS amount
    FROM public.seller_external_fee_entries f
    WHERE f.store_id = _store_id
  )
  SELECT earned.amount, payouts.amount, fees.amount,
         greatest(0, earned.amount - payouts.amount - fees.amount), 50000::bigint
  FROM earned, payouts, fees;
END;
$$;

REVOKE ALL ON FUNCTION public.get_seller_payout_preview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_seller_payout_preview(uuid) TO authenticated, service_role;


-- All evidenced external fees recorded against a seller are borne by that seller,
-- not the platform; this supersedes the earlier transfer-only deduction routine.
CREATE OR REPLACE FUNCTION public.admin_create_seller_payout(
  _store_id uuid,
  _idempotency_key text,
  _scheduled_for timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _existing public.seller_payouts%ROWTYPE;
  _preference public.seller_payout_preferences%ROWTYPE;
  _commission_bps integer;
  _gross bigint;
  _discount bigint;
  _commission bigint;
  _seller_gross bigint;
  _external_fees bigint;
  _seller_amount bigint;
  _payout_id uuid;
  _fee record;
  _remaining bigint;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;

  PERFORM 1 FROM public.stores WHERE id = _store_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'store_not_found'; END IF;

  SELECT * INTO _existing
  FROM public.seller_payouts
  WHERE idempotency_key = trim(_idempotency_key);
  IF FOUND THEN
    IF _existing.store_id <> _store_id THEN
      RAISE EXCEPTION 'idempotency_key_conflict';
    END IF;
    RETURN _existing.id;
  END IF;

  SELECT * INTO _preference
  FROM public.seller_payout_preferences
  WHERE store_id = _store_id
  FOR UPDATE;
  IF NOT FOUND
     OR _preference.account_holder_name IS NULL
     OR _preference.account_identifier IS NULL THEN
    RAISE EXCEPTION 'payout_destination_required';
  END IF;

  SELECT
    coalesce(sum(oi.gross_millimes), 0),
    coalesce(sum(oi.discount_millimes), 0),
    coalesce(sum(oi.commission_millimes), 0),
    coalesce(sum(le.amount_millimes), 0)
  INTO _gross, _discount, _commission, _seller_gross
  FROM public.seller_ledger_entries le
  JOIN public.order_items oi ON oi.id = le.order_item_id
  JOIN public.orders o ON o.id = oi.order_id
  WHERE le.store_id = _store_id
    AND le.entry_type = 'sale_net'
    AND o.status = 'paid'
    AND o.payment_mode = 'verified'
    AND NOT EXISTS (
      SELECT 1 FROM public.seller_payout_items pi
      WHERE pi.ledger_entry_id = le.id
    );

  IF _seller_gross <= 0 OR _gross <= _discount
     OR _gross <> _discount + _commission + _seller_gross THEN
    RAISE EXCEPTION 'payout_amount_reconciliation_failed';
  END IF;

  _commission_bps := round(_commission::numeric * 10000 / (_gross - _discount))::integer;

  SELECT coalesce(sum(f.amount_millimes - coalesce(a.allocated, 0)), 0)
  INTO _external_fees
  FROM public.seller_external_fee_entries f
  LEFT JOIN LATERAL (
    SELECT sum(x.amount_millimes) AS allocated
    FROM public.seller_payout_fee_allocations x
    WHERE x.fee_entry_id = f.id
  ) a ON true
  WHERE f.store_id = _store_id
    AND f.amount_millimes > coalesce(a.allocated, 0);

  IF _external_fees > _seller_gross THEN
    RAISE EXCEPTION 'external_fees_exceed_available_seller_balance';
  END IF;

  _seller_amount := _seller_gross - _external_fees;
  IF _seller_amount < 50000 THEN
    RAISE EXCEPTION 'payout_minimum_not_met';
  END IF;
  IF _seller_amount <= 0 THEN
    RAISE EXCEPTION 'no_positive_payout_after_external_fees';
  END IF;

  INSERT INTO public.seller_payouts (
    store_id, method, status, currency, gross_millimes, discount_millimes,
    commission_bps, commission_millimes, seller_amount_millimes,
    external_fees_millimes, idempotency_key, provider, scheduled_for,
    payout_destination_method, payout_account_holder_name,
    payout_provider_name, payout_account_identifier, payout_bank_name,
    payout_additional_details
  ) VALUES (
    _store_id, 'weekly_manual', 'pending', 'TND', _gross, _discount,
    _commission_bps, _commission, _seller_amount,
    _external_fees, trim(_idempotency_key), 'manual', _scheduled_for,
    _preference.method, _preference.account_holder_name,
    _preference.provider_name, _preference.account_identifier,
    _preference.bank_name, _preference.additional_details
  )
  RETURNING id INTO _payout_id;

  INSERT INTO public.seller_payout_items (
    payout_id, ledger_entry_id, order_item_id, gross_millimes,
    discount_millimes, commission_millimes, commission_bps, seller_amount_millimes
  )
  SELECT _payout_id, le.id, oi.id, oi.gross_millimes,
         oi.discount_millimes, oi.commission_millimes, oi.commission_bps, le.amount_millimes
  FROM public.seller_ledger_entries le
  JOIN public.order_items oi ON oi.id = le.order_item_id
  JOIN public.orders o ON o.id = oi.order_id
  WHERE le.store_id = _store_id
    AND le.entry_type = 'sale_net'
    AND o.status = 'paid'
    AND o.payment_mode = 'verified'
    AND NOT EXISTS (
      SELECT 1 FROM public.seller_payout_items pi
      WHERE pi.ledger_entry_id = le.id
    );

  FOR _fee IN
    SELECT f.id,
      f.amount_millimes - coalesce((
        SELECT sum(a.amount_millimes)
        FROM public.seller_payout_fee_allocations a
        WHERE a.fee_entry_id = f.id
      ), 0) AS remaining
    FROM public.seller_external_fee_entries f
    WHERE f.store_id = _store_id
        AND f.amount_millimes > coalesce((
        SELECT sum(a.amount_millimes)
        FROM public.seller_payout_fee_allocations a
        WHERE a.fee_entry_id = f.id
      ), 0)
    ORDER BY f.created_at, f.id
    FOR UPDATE OF f
  LOOP
    _remaining := _fee.remaining;
    INSERT INTO public.seller_payout_fee_allocations (
      fee_entry_id, payout_id, store_id, amount_millimes
    ) VALUES (_fee.id, _payout_id, _store_id, _remaining);
  END LOOP;

  IF (SELECT count(*) FROM public.seller_payout_items WHERE payout_id = _payout_id) = 0
     OR (SELECT coalesce(sum(amount_millimes), 0)
         FROM public.seller_payout_fee_allocations WHERE payout_id = _payout_id) <> _external_fees THEN
    RAISE EXCEPTION 'payout_fee_allocation_reconciliation_failed';
  END IF;

  RETURN _payout_id;
END;
$$;


REVOKE ALL ON FUNCTION public.admin_create_seller_payout(uuid,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_seller_payout(uuid,text,timestamptz) TO service_role;
