-- Eligibility is strictly greater than 100 TND: exactly 100.000 TND is not eligible.
-- Require a seller's available net proceeds to exceed 100 TND before
-- preparing a manual payout. Amounts are stored in millimes (100 TND = 100000).
-- The database guard is authoritative; the admin UI mirrors it for clarity.
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
  IF _seller_amount <= 100000 THEN
    RAISE EXCEPTION 'payout_minimum_not_met';
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
