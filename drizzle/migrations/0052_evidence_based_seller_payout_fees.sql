-- Re-enable deductions only for actual, evidence-backed seller fees.
-- The existing append-only fee register requires an external statement/reference;
-- tariff estimates or assumed VAT are not inserted as payable fees.
-- The seller's net payout after allocated fees must be at least 50.000 TND.
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
