-- Record buyer-return verification as its own auditable iPay settlement source.
-- This migration changes only the accepted source labels; it does not enable checkout
-- or execute any provider requests.

ALTER TABLE public.provider_payment_settlements
  DROP CONSTRAINT provider_payment_settlements_source_check;

ALTER TABLE public.provider_payment_settlements
  ADD CONSTRAINT provider_payment_settlements_source_check
  CHECK (source IN ('webhook', 'polling', 'admin_check', 'return_check'));

CREATE OR REPLACE FUNCTION public.settle_ipay_verified_payment(
  _order_id uuid,
  _provider_transaction_id text,
  _invoice_reference text,
  _amount_millimes integer,
  _currency text,
  _provider_status text,
  _source text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _order public.orders%ROWTYPE;
  _existing public.provider_payment_settlements%ROWTYPE;
  _inserted_id uuid;
  _outcome text;
BEGIN
  IF _provider_transaction_id IS NULL
     OR length(trim(_provider_transaction_id)) NOT BETWEEN 1 AND 200
     OR _invoice_reference IS NULL
     OR length(trim(_invoice_reference)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid_provider_reference';
  END IF;
  IF _currency IS DISTINCT FROM 'TND' THEN RAISE EXCEPTION 'currency_mismatch'; END IF;
  IF _provider_status IS DISTINCT FROM 'completed' THEN RETURN 'not_completed'; END IF;
  IF _source NOT IN ('webhook', 'polling', 'admin_check', 'return_check') THEN
    RAISE EXCEPTION 'invalid_source';
  END IF;
  IF _amount_millimes IS NULL OR _amount_millimes <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT * INTO _order
    FROM public.orders
   WHERE id = _order_id
   FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unknown_order'; END IF;

  IF _invoice_reference IS DISTINCT FROM _order.id::text THEN
    RAISE EXCEPTION 'invoice_reference_mismatch';
  END IF;
  IF _order.ipay_payment_ref IS DISTINCT FROM _provider_transaction_id THEN
    RAISE EXCEPTION 'provider_transaction_reference_mismatch';
  END IF;
  IF _amount_millimes IS DISTINCT FROM _order.total_millimes THEN
    RAISE EXCEPTION 'amount_mismatch';
  END IF;

  SELECT * INTO _existing
    FROM public.provider_payment_settlements
   WHERE provider = 'ipay'
     AND provider_transaction_id = trim(_provider_transaction_id);
  IF FOUND THEN
    IF _existing.order_id = _order_id
       AND _existing.invoice_reference = _invoice_reference
       AND _existing.amount_millimes = _amount_millimes THEN
      RETURN 'already_processed';
    END IF;
    RAISE EXCEPTION 'provider_transaction_reused';
  END IF;

  IF _order.status <> 'pending' THEN RETURN 'order_closed'; END IF;

  INSERT INTO public.provider_payment_settlements (
    provider, provider_transaction_id, invoice_reference, order_id,
    amount_millimes, currency, provider_status, source
  ) VALUES (
    'ipay', trim(_provider_transaction_id), trim(_invoice_reference), _order_id,
    _amount_millimes, 'TND', 'completed', _source
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO _inserted_id;

  IF _inserted_id IS NULL THEN
    SELECT * INTO _existing
      FROM public.provider_payment_settlements
     WHERE (provider = 'ipay' AND provider_transaction_id = trim(_provider_transaction_id))
        OR (provider = 'ipay' AND invoice_reference = trim(_invoice_reference))
     LIMIT 1;
    IF FOUND AND _existing.order_id = _order_id
       AND _existing.provider_transaction_id = trim(_provider_transaction_id)
       AND _existing.amount_millimes = _amount_millimes THEN
      RETURN 'already_processed';
    END IF;
    RAISE EXCEPTION 'provider_transaction_or_invoice_reused';
  END IF;

  _outcome := public.settle_order_payment(
    _order_id, 'verified', trim(_provider_transaction_id), _amount_millimes, _source
  );
  IF _outcome <> 'paid' THEN
    RAISE EXCEPTION 'ipay_settlement_not_applied:%', _outcome;
  END IF;

  RETURN 'paid';
END;
$$;

REVOKE ALL ON FUNCTION public.settle_ipay_verified_payment(uuid,text,text,integer,text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_ipay_verified_payment(uuid,text,text,integer,text,text,text)
  TO service_role;
