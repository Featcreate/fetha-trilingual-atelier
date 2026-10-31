-- Complete the manual weekly payout lifecycle with admin-only, idempotent RPCs.
-- No provider API or automatic transfer is called by this migration.

CREATE OR REPLACE FUNCTION public.guard_seller_payout_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.id, NEW.store_id, NEW.method, NEW.currency, NEW.gross_millimes, NEW.discount_millimes,
      NEW.commission_bps, NEW.commission_millimes, NEW.seller_amount_millimes,
      NEW.idempotency_key, NEW.provider, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.store_id, OLD.method, OLD.currency, OLD.gross_millimes, OLD.discount_millimes,
      OLD.commission_bps, OLD.commission_millimes, OLD.seller_amount_millimes,
      OLD.idempotency_key, OLD.provider, OLD.created_at) THEN
    RAISE EXCEPTION 'payout_financial_snapshot_immutable';
  END IF;

  IF OLD.status IN ('paid','cancelled') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'payout_terminal_state';
  END IF;
  IF NOT (
    (OLD.status = 'pending' AND NEW.status IN ('processing','paid','failed','cancelled'))
    OR (OLD.status = 'processing' AND NEW.status IN ('paid','failed'))
    OR (OLD.status = 'failed' AND NEW.status IN ('processing','paid','cancelled'))
    OR NEW.status = OLD.status
  ) THEN
    RAISE EXCEPTION 'invalid_payout_status_transition';
  END IF;

  IF NEW.status IN ('processing','paid') THEN
    IF NOT EXISTS (SELECT 1 FROM public.seller_payout_items WHERE payout_id = NEW.id) THEN
      RAISE EXCEPTION 'payout_has_no_items';
    END IF;
    IF NEW.gross_millimes <> (SELECT coalesce(sum(gross_millimes),0) FROM public.seller_payout_items WHERE payout_id = NEW.id)
       OR NEW.discount_millimes <> (SELECT coalesce(sum(discount_millimes),0) FROM public.seller_payout_items WHERE payout_id = NEW.id)
       OR NEW.commission_millimes <> (SELECT coalesce(sum(commission_millimes),0) FROM public.seller_payout_items WHERE payout_id = NEW.id)
       OR NEW.seller_amount_millimes <> (SELECT coalesce(sum(seller_amount_millimes),0) FROM public.seller_payout_items WHERE payout_id = NEW.id) THEN
      RAISE EXCEPTION 'payout_items_total_mismatch';
    END IF;
  END IF;
  IF NEW.status = 'paid' AND (NEW.paid_at IS NULL
      OR length(trim(coalesce(NEW.provider_transfer_ref,''))) = 0) THEN
    RAISE EXCEPTION 'payout_confirmation_required';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Create one weekly-manual payout batch for unbatched verified sales at one
-- commission rate. Store row locking serializes concurrent batch creation.
CREATE OR REPLACE FUNCTION public.admin_create_seller_payout(
  _store_id uuid,
  _idempotency_key text,
  _scheduled_for timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _existing public.seller_payouts%ROWTYPE;
  _commission_bps integer;
  _gross bigint;
  _discount bigint;
  _commission bigint;
  _seller_amount bigint;
  _payout_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'invalid_idempotency_key';
  END IF;

  PERFORM 1 FROM public.stores WHERE id = _store_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'store_not_found'; END IF;

  SELECT * INTO _existing FROM public.seller_payouts WHERE idempotency_key = _idempotency_key;
  IF FOUND THEN
    IF _existing.store_id <> _store_id THEN RAISE EXCEPTION 'idempotency_key_conflict'; END IF;
    RETURN _existing.id;
  END IF;

  IF EXISTS (SELECT 1 FROM public.seller_payout_preferences
      WHERE store_id = _store_id AND method <> 'weekly_manual') THEN
    RAISE EXCEPTION 'unsupported_payout_method';
  END IF;

  SELECT oi.commission_bps INTO _commission_bps
  FROM public.seller_ledger_entries le
  JOIN public.order_items oi ON oi.id = le.order_item_id
  JOIN public.orders o ON o.id = oi.order_id
  WHERE le.store_id = _store_id AND le.entry_type = 'sale_net'
    AND o.status = 'paid' AND o.payment_mode = 'verified'
    AND NOT EXISTS (SELECT 1 FROM public.seller_payout_items pi WHERE pi.ledger_entry_id = le.id)
  ORDER BY le.created_at, le.id
  LIMIT 1;

  IF _commission_bps IS NULL THEN RAISE EXCEPTION 'no_unpaid_sales'; END IF;

  SELECT
    coalesce(sum(oi.gross_millimes),0),
    coalesce(sum(oi.discount_millimes),0),
    coalesce(sum(oi.commission_millimes),0),
    coalesce(sum(le.amount_millimes),0)
  INTO _gross, _discount, _commission, _seller_amount
  FROM public.seller_ledger_entries le
  JOIN public.order_items oi ON oi.id = le.order_item_id
  JOIN public.orders o ON o.id = oi.order_id
  WHERE le.store_id = _store_id AND le.entry_type = 'sale_net'
    AND oi.commission_bps = _commission_bps
    AND o.status = 'paid' AND o.payment_mode = 'verified'
    AND NOT EXISTS (SELECT 1 FROM public.seller_payout_items pi WHERE pi.ledger_entry_id = le.id);

  IF _seller_amount <= 0 OR _gross <> _discount + _commission + _seller_amount THEN
    RAISE EXCEPTION 'payout_amount_reconciliation_failed';
  END IF;

  INSERT INTO public.seller_payouts (
    store_id, method, status, currency, gross_millimes, discount_millimes,
    commission_bps, commission_millimes, seller_amount_millimes,
    idempotency_key, provider, scheduled_for
  ) VALUES (
    _store_id, 'weekly_manual', 'pending', 'TND', _gross, _discount,
    _commission_bps, _commission, _seller_amount,
    trim(_idempotency_key), 'manual', _scheduled_for
  ) RETURNING id INTO _payout_id;

  INSERT INTO public.seller_payout_items (
    payout_id, ledger_entry_id, order_item_id, gross_millimes,
    discount_millimes, commission_millimes, seller_amount_millimes
  )
  SELECT _payout_id, le.id, oi.id, oi.gross_millimes,
         oi.discount_millimes, oi.commission_millimes, le.amount_millimes
  FROM public.seller_ledger_entries le
  JOIN public.order_items oi ON oi.id = le.order_item_id
  JOIN public.orders o ON o.id = oi.order_id
  WHERE le.store_id = _store_id AND le.entry_type = 'sale_net'
    AND oi.commission_bps = _commission_bps
    AND o.status = 'paid' AND o.payment_mode = 'verified'
    AND NOT EXISTS (SELECT 1 FROM public.seller_payout_items pi WHERE pi.ledger_entry_id = le.id);

  IF (SELECT count(*) FROM public.seller_payout_items WHERE payout_id = _payout_id) = 0 THEN
    RAISE EXCEPTION 'no_unpaid_sales';
  END IF;
  RETURN _payout_id;
END $$;

-- Confirm a real manual transfer only after an administrator enters its
-- bank/provider reference. This records evidence; it does not move money.
CREATE OR REPLACE FUNCTION public.admin_mark_seller_payout_paid(
  _payout_id uuid,
  _transfer_reference text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _p public.seller_payouts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _transfer_reference IS NULL OR length(trim(_transfer_reference)) NOT BETWEEN 3 AND 200 THEN
    RAISE EXCEPTION 'transfer_reference_required';
  END IF;

  SELECT * INTO _p FROM public.seller_payouts WHERE id = _payout_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'payout_not_found'; END IF;
  IF _p.method <> 'weekly_manual' OR _p.provider <> 'manual' THEN
    RAISE EXCEPTION 'unsupported_payout_method';
  END IF;
  IF _p.status = 'paid' THEN
    IF _p.provider_transfer_ref = trim(_transfer_reference) THEN RETURN true; END IF;
    RAISE EXCEPTION 'payout_already_paid';
  END IF;
  IF _p.status NOT IN ('pending','processing','failed') THEN
    RAISE EXCEPTION 'payout_not_payable';
  END IF;

  UPDATE public.seller_payouts
  SET status = 'paid',
      provider_transfer_ref = trim(_transfer_reference),
      initiated_at = coalesce(initiated_at, now()),
      paid_at = now(),
      failure_reason = NULL
  WHERE id = _payout_id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.admin_mark_seller_payout_failed(
  _payout_id uuid,
  _failure_reason text
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _failure_reason IS NULL OR length(trim(_failure_reason)) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'failure_reason_required';
  END IF;
  UPDATE public.seller_payouts
  SET status = 'failed', failure_reason = trim(_failure_reason),
      initiated_at = coalesce(initiated_at, now())
  WHERE id = _payout_id AND status IN ('pending','processing');
  IF NOT FOUND THEN RAISE EXCEPTION 'payout_not_fail-able'; END IF;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.admin_create_seller_payout(uuid,text,timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mark_seller_payout_paid(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mark_seller_payout_failed(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_seller_payout(uuid,text,timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_mark_seller_payout_paid(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_mark_seller_payout_failed(uuid,text) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_create_seller_payout(uuid,text,timestamptz) IS
  'Admin-only. Creates an idempotent manual payout batch from unbatched, verified sale_net ledger entries.';
COMMENT ON FUNCTION public.admin_mark_seller_payout_paid(uuid,text) IS
  'Admin-only. Records a completed manual transfer and its unique external reference; never initiates a transfer.';
COMMENT ON FUNCTION public.admin_mark_seller_payout_failed(uuid,text) IS
  'Admin-only. Records a failed manual payout attempt without releasing its sale lines for duplicate payment.';
