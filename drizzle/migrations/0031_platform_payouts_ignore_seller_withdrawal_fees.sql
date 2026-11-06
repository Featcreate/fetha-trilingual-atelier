-- External withdrawal/receiving fees belong to the seller's chosen provider,
-- outside Algorea Bazaar. New payouts pay the full seller ledger balance
-- after platform commission and never allocate or deduct provider fees.
CREATE OR REPLACE FUNCTION public.admin_create_seller_payout(
  _store_id uuid, _idempotency_key text, _scheduled_for timestamptz DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  _existing public.seller_payouts%ROWTYPE;
  _preference public.seller_payout_preferences%ROWTYPE;
  _commission_bps integer;
  _gross bigint;
  _discount bigint;
  _commission bigint;
  _seller_amount bigint;
  _payout_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _idempotency_key IS NULL OR length(trim(_idempotency_key)) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'invalid_idempotency_key'; END IF;
  PERFORM 1 FROM public.stores WHERE id = _store_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'store_not_found'; END IF;
  SELECT * INTO _existing FROM public.seller_payouts WHERE idempotency_key = trim(_idempotency_key);
  IF FOUND THEN
    IF _existing.store_id <> _store_id THEN RAISE EXCEPTION 'idempotency_key_conflict'; END IF;
    RETURN _existing.id;
  END IF;
  SELECT * INTO _preference FROM public.seller_payout_preferences WHERE store_id = _store_id FOR UPDATE;
  IF NOT FOUND OR _preference.account_holder_name IS NULL OR _preference.account_identifier IS NULL THEN RAISE EXCEPTION 'payout_destination_required'; END IF;
  SELECT coalesce(sum(oi.gross_millimes),0), coalesce(sum(oi.discount_millimes),0),
         coalesce(sum(oi.commission_millimes),0), coalesce(sum(le.amount_millimes),0)
  INTO _gross, _discount, _commission, _seller_amount
  FROM public.seller_ledger_entries le
  JOIN public.order_items oi ON oi.id = le.order_item_id
  JOIN public.orders o ON o.id = oi.order_id
  WHERE le.store_id = _store_id AND le.entry_type = 'sale_net'
    AND o.status = 'paid' AND o.payment_mode = 'verified'
    AND NOT EXISTS (SELECT 1 FROM public.seller_payout_items pi WHERE pi.ledger_entry_id = le.id);
  IF _seller_amount <= 0 OR _gross <= _discount OR _gross <> _discount + _commission + _seller_amount THEN
    RAISE EXCEPTION 'payout_amount_reconciliation_failed';
  END IF;
  _commission_bps := round(_commission::numeric * 10000 / (_gross - _discount))::integer;
  INSERT INTO public.seller_payouts (
    store_id, method, status, currency, gross_millimes, discount_millimes,
    commission_bps, commission_millimes, seller_amount_millimes, external_fees_millimes,
    idempotency_key, provider, scheduled_for, payout_destination_method,
    payout_account_holder_name, payout_provider_name, payout_account_identifier,
    payout_bank_name, payout_additional_details
  ) VALUES (
    _store_id, 'weekly_manual', 'pending', 'TND', _gross, _discount,
    _commission_bps, _commission, _seller_amount, 0, trim(_idempotency_key),
    'manual', _scheduled_for, _preference.method, _preference.account_holder_name,
    _preference.provider_name, _preference.account_identifier,
    _preference.bank_name, _preference.additional_details
  ) RETURNING id INTO _payout_id;
  INSERT INTO public.seller_payout_items (
    payout_id, ledger_entry_id, order_item_id, gross_millimes, discount_millimes,
    commission_millimes, commission_bps, seller_amount_millimes
  )
  SELECT _payout_id, le.id, oi.id, oi.gross_millimes, oi.discount_millimes,
         oi.commission_millimes, oi.commission_bps, le.amount_millimes
  FROM public.seller_ledger_entries le
  JOIN public.order_items oi ON oi.id = le.order_item_id
  JOIN public.orders o ON o.id = oi.order_id
  WHERE le.store_id = _store_id AND le.entry_type = 'sale_net'
    AND o.status = 'paid' AND o.payment_mode = 'verified'
    AND NOT EXISTS (SELECT 1 FROM public.seller_payout_items pi WHERE pi.ledger_entry_id = le.id);
  IF (SELECT count(*) FROM public.seller_payout_items WHERE payout_id = _payout_id) = 0 THEN RAISE EXCEPTION 'payout_has_no_items'; END IF;
  RETURN _payout_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_create_seller_payout(uuid,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_seller_payout(uuid,text,timestamptz) TO authenticated, service_role;

-- Keep legacy payout records valid while new payouts carry zero external fees.
CREATE OR REPLACE FUNCTION public.guard_seller_payout_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = ''
AS $$
BEGIN
  IF (NEW.id, NEW.store_id, NEW.method, NEW.currency, NEW.gross_millimes, NEW.discount_millimes,
      NEW.commission_bps, NEW.commission_millimes, NEW.seller_amount_millimes,
      NEW.external_fees_millimes, NEW.idempotency_key, NEW.provider, NEW.created_at,
      NEW.payout_destination_method, NEW.payout_account_holder_name,
      NEW.payout_provider_name, NEW.payout_account_identifier, NEW.payout_bank_name,
      NEW.payout_additional_details)
     IS DISTINCT FROM
     (OLD.id, OLD.store_id, OLD.method, OLD.currency, OLD.gross_millimes, OLD.discount_millimes,
      OLD.commission_bps, OLD.commission_millimes, OLD.seller_amount_millimes,
      OLD.external_fees_millimes, OLD.idempotency_key, OLD.provider, OLD.created_at,
      OLD.payout_destination_method, OLD.payout_account_holder_name,
      OLD.payout_provider_name, OLD.payout_account_identifier, OLD.payout_bank_name,
      OLD.payout_additional_details) THEN RAISE EXCEPTION 'payout_financial_snapshot_immutable'; END IF;
  IF OLD.status IN ('paid','cancelled') AND NEW.status <> OLD.status THEN RAISE EXCEPTION 'payout_terminal_state'; END IF;
  IF NOT ((OLD.status = 'pending' AND NEW.status IN ('processing','paid','failed','cancelled'))
       OR (OLD.status = 'processing' AND NEW.status IN ('paid','failed'))
       OR (OLD.status = 'failed' AND NEW.status IN ('processing','paid','cancelled'))
       OR NEW.status = OLD.status) THEN RAISE EXCEPTION 'invalid_payout_status_transition'; END IF;
  IF NEW.status IN ('processing','paid') THEN
    IF NOT EXISTS (SELECT 1 FROM public.seller_payout_items WHERE payout_id = NEW.id) THEN RAISE EXCEPTION 'payout_has_no_items'; END IF;
    IF NEW.gross_millimes <> (SELECT coalesce(sum(gross_millimes),0) FROM public.seller_payout_items WHERE payout_id = NEW.id)
       OR NEW.discount_millimes <> (SELECT coalesce(sum(discount_millimes),0) FROM public.seller_payout_items WHERE payout_id = NEW.id)
       OR NEW.commission_millimes <> (SELECT coalesce(sum(commission_millimes),0) FROM public.seller_payout_items WHERE payout_id = NEW.id)
       OR NEW.seller_amount_millimes + NEW.external_fees_millimes <>
          (SELECT coalesce(sum(seller_amount_millimes),0) FROM public.seller_payout_items WHERE payout_id = NEW.id)
       OR NEW.external_fees_millimes <>
          (SELECT coalesce(sum(amount_millimes),0) FROM public.seller_payout_fee_allocations WHERE payout_id = NEW.id)
    THEN RAISE EXCEPTION 'payout_items_total_mismatch'; END IF;
  END IF;
  IF NEW.status = 'paid' AND (NEW.paid_at IS NULL OR length(trim(coalesce(NEW.provider_transfer_ref,''))) = 0) THEN
    RAISE EXCEPTION 'payout_confirmation_required';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_seller_payout_update() FROM PUBLIC, anon, authenticated;
