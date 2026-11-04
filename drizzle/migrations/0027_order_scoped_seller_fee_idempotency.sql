-- Extend seller-fee business-reference idempotency to order-scoped fees.
-- Migration 0026 added unique indexes for both order-scoped and store-scoped
-- evidence references, but its RPC only looked up store-scoped references before
-- inserting. This function now resolves the business reference first in both
-- cases, returning the original row for an exact retry and rejecting conflicts.
-- No financial rows are changed and no payment or payout is initiated.

CREATE OR REPLACE FUNCTION public.admin_record_seller_external_fee(
  _store_id uuid,
  _fee_category text,
  _amount_millimes bigint,
  _source text,
  _external_reference text,
  _description text,
  _idempotency_key text,
  _order_id uuid DEFAULT NULL,
  _order_item_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _seller_id uuid;
  _existing public.seller_external_fee_entries%ROWTYPE;
  _fee_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _amount_millimes IS NULL OR _amount_millimes <= 0 THEN
    RAISE EXCEPTION 'invalid_external_fee_amount';
  END IF;
  IF _fee_category NOT IN (
    'payment_processing','payment_collection','currency_conversion',
    'provider_settlement','seller_transfer','receiving','withdrawal','other'
  ) THEN
    RAISE EXCEPTION 'invalid_external_fee_category';
  END IF;
  IF _source IS NULL OR length(trim(_source)) NOT BETWEEN 1 AND 80
     OR _external_reference IS NULL OR length(trim(_external_reference)) NOT BETWEEN 3 AND 200
     OR _description IS NULL OR length(trim(_description)) NOT BETWEEN 3 AND 500
     OR _idempotency_key IS NULL OR length(trim(_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'external_fee_evidence_required';
  END IF;

  SELECT s.owner_id INTO _seller_id
  FROM public.stores s
  WHERE s.id = _store_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_not_found';
  END IF;

  -- The store row lock serializes all fee registrations for this store.
  -- Match the real evidence identity before considering the client request key,
  -- so a retry with a fresh UUID cannot create a second fee debit.
  SELECT * INTO _existing
  FROM public.seller_external_fee_entries
  WHERE store_id = _store_id
    AND order_id IS NOT DISTINCT FROM _order_id
    AND external_reference = trim(_external_reference)
  FOR UPDATE;

  IF FOUND THEN
    IF _existing.seller_id IS DISTINCT FROM _seller_id
       OR _existing.order_item_id IS DISTINCT FROM _order_item_id
       OR _existing.amount_millimes <> _amount_millimes
       OR _existing.fee_category <> _fee_category
       OR _existing.source <> trim(_source)
       OR _existing.description <> trim(_description) THEN
      RAISE EXCEPTION 'external_fee_business_reference_conflict';
    END IF;
    RETURN _existing.id;
  END IF;

  SELECT * INTO _existing
  FROM public.seller_external_fee_entries
  WHERE idempotency_key = trim(_idempotency_key)
  FOR UPDATE;

  IF FOUND THEN
    IF _existing.store_id <> _store_id
       OR _existing.seller_id IS DISTINCT FROM _seller_id
       OR _existing.order_id IS DISTINCT FROM _order_id
       OR _existing.order_item_id IS DISTINCT FROM _order_item_id
       OR _existing.amount_millimes <> _amount_millimes
       OR _existing.fee_category <> _fee_category
       OR _existing.external_reference <> trim(_external_reference)
       OR _existing.source <> trim(_source)
       OR _existing.description <> trim(_description) THEN
      RAISE EXCEPTION 'external_fee_idempotency_conflict';
    END IF;
    RETURN _existing.id;
  END IF;

  INSERT INTO public.seller_external_fee_entries (
    store_id, seller_id, order_id, order_item_id, fee_category,
    amount_millimes, currency, source, external_reference, description,
    idempotency_key, recorded_by
  ) VALUES (
    _store_id, _seller_id, _order_id, _order_item_id, _fee_category,
    _amount_millimes, 'TND', trim(_source), trim(_external_reference),
    trim(_description), trim(_idempotency_key), auth.uid()
  )
  RETURNING id INTO _fee_id;

  INSERT INTO public.platform_financial_ledger_entries (
    entry_type, entry_side, order_id, seller_id, store_id,
    transaction_currency, transaction_amount_minor, transaction_currency_exponent,
    accounting_currency, accounting_amount_millimes,
    fx_rate, fx_rate_source, fx_rate_at,
    source, external_reference, idempotency_key
  ) VALUES (
    'provider_fee', 'debit', _order_id, _seller_id, _store_id,
    'TND', _amount_millimes, 3, 'TND', _amount_millimes,
    1, 'TND_verified_provider_fee', now(),
    'admin_recorded_external_fee', trim(_external_reference),
    'seller_external_fee:' || _fee_id::text
  );

  RETURN _fee_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_seller_external_fee(uuid,text,bigint,text,text,text,text,uuid,uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_record_seller_external_fee(uuid,text,bigint,text,text,text,text,uuid,uuid)
  TO authenticated;

COMMENT ON FUNCTION public.admin_record_seller_external_fee(uuid,text,bigint,text,text,text,text,uuid,uuid) IS
  'Admin-only: record one evidence-backed seller fee. Retries are idempotent by store, optional order/item scope, and external evidence reference; conflicting reuse is rejected.';
