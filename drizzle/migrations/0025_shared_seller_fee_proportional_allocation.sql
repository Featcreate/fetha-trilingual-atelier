-- Allocate a single verified order-level provider fee across its sellers
-- proportionally to each seller's paid, discounted order-item payable amount.
-- Largest-remainder rounding guarantees the allocations sum exactly to the fee.

CREATE OR REPLACE FUNCTION public.admin_record_shared_seller_fee(
  _order_id uuid,
  _fee_category text,
  _amount_millimes bigint,
  _source text,
  _external_reference text,
  _description text,
  _idempotency_key text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _order public.orders%ROWTYPE;
  _allocation record;
  _existing public.seller_external_fee_entries%ROWTYPE;
  _fee_id uuid;
  _entry_key text;
  _inserted integer := 0;
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
  ) THEN RAISE EXCEPTION 'invalid_external_fee_category'; END IF;
  IF _source IS NULL OR length(trim(_source)) NOT BETWEEN 1 AND 80
     OR _external_reference IS NULL OR length(trim(_external_reference)) NOT BETWEEN 3 AND 200
     OR _description IS NULL OR length(trim(_description)) NOT BETWEEN 3 AND 500
     OR _idempotency_key IS NULL OR length(trim(_idempotency_key)) NOT BETWEEN 8 AND 150 THEN
    RAISE EXCEPTION 'external_fee_evidence_required';
  END IF;

  SELECT * INTO _order FROM public.orders
  WHERE id = _order_id
  FOR UPDATE;
  IF NOT FOUND OR _order.status <> 'paid'
     OR _order.payment_mode <> 'verified' OR _order.currency <> 'TND' THEN
    RAISE EXCEPTION 'shared_fee_requires_verified_paid_tnd_order';
  END IF;

  FOR _allocation IN
    WITH seller_weights AS (
      SELECT oi.store_id, oi.seller_id,
             sum(oi.payable_millimes)::numeric AS weight
      FROM public.order_items oi
      WHERE oi.order_id = _order_id
        AND oi.store_id IS NOT NULL
        AND oi.seller_id IS NOT NULL
        AND oi.payable_millimes > 0
      GROUP BY oi.store_id, oi.seller_id
    ),
    weighted AS (
      SELECT sw.store_id, sw.seller_id, sw.weight,
             floor(_amount_millimes::numeric * sw.weight / sum(sw.weight) OVER ())::bigint AS base_amount,
             mod(_amount_millimes::numeric * sw.weight, sum(sw.weight) OVER ()) AS remainder_numerator
      FROM seller_weights sw
    ),
    ranked AS (
      SELECT w.*,
             row_number() OVER (ORDER BY w.remainder_numerator DESC, w.store_id) AS remainder_rank,
             _amount_millimes - sum(w.base_amount) OVER () AS remainder_units
      FROM weighted w
    )
    SELECT store_id, seller_id,
           base_amount + CASE WHEN remainder_rank <= remainder_units THEN 1 ELSE 0 END AS allocated_millimes
    FROM ranked
    WHERE base_amount + CASE WHEN remainder_rank <= remainder_units THEN 1 ELSE 0 END > 0
    ORDER BY store_id
  LOOP
    _entry_key := trim(_idempotency_key) || ':' || _allocation.store_id::text;
    SELECT * INTO _existing FROM public.seller_external_fee_entries
    WHERE idempotency_key = _entry_key;
    IF FOUND THEN
      IF _existing.store_id <> _allocation.store_id
         OR _existing.order_id <> _order_id
         OR _existing.amount_millimes <> _allocation.allocated_millimes
         OR _existing.external_reference <> trim(_external_reference) THEN
        RAISE EXCEPTION 'shared_external_fee_idempotency_conflict';
      END IF;
      CONTINUE;
    END IF;

    INSERT INTO public.seller_external_fee_entries (
      store_id, seller_id, order_id, fee_category, amount_millimes, currency,
      source, external_reference, description, idempotency_key, recorded_by
    ) VALUES (
      _allocation.store_id, _allocation.seller_id, _order_id, _fee_category,
      _allocation.allocated_millimes, 'TND', trim(_source), trim(_external_reference),
      trim(_description) || ' | Proportional allocation based on each seller store''s paid order-item payable amount.',
      _entry_key, auth.uid()
    ) RETURNING id INTO _fee_id;

    INSERT INTO public.platform_financial_ledger_entries (
      entry_type, entry_side, order_id, seller_id, store_id,
      transaction_currency, transaction_amount_minor, transaction_currency_exponent,
      accounting_currency, accounting_amount_millimes,
      fx_rate, fx_rate_source, fx_rate_at,
      source, external_reference, idempotency_key
    ) VALUES (
      'provider_fee', 'debit', _order_id, _allocation.seller_id, _allocation.store_id,
      'TND', _allocation.allocated_millimes, 3, 'TND', _allocation.allocated_millimes,
      1, 'TND_verified_provider_fee', now(),
      'admin_recorded_shared_external_fee', trim(_external_reference),
      'seller_external_fee:' || _fee_id::text
    );
    _inserted := _inserted + 1;
  END LOOP;

  IF _inserted = 0 AND NOT EXISTS (
    SELECT 1 FROM public.seller_external_fee_entries
    WHERE order_id = _order_id
      AND external_reference = trim(_external_reference)
      AND idempotency_key LIKE trim(_idempotency_key) || ':%'
  ) THEN
    RAISE EXCEPTION 'no_eligible_seller_order_items';
  END IF;
  RETURN _inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_shared_seller_fee(uuid,text,bigint,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_record_shared_seller_fee(uuid,text,bigint,text,text,text,text) TO authenticated;

COMMENT ON FUNCTION public.admin_record_shared_seller_fee(uuid,text,bigint,text,text,text,text) IS
  'Admin-only: allocate a verified TND order-level external fee proportionally across sellers by paid discounted order-item payable amount, using largest-remainder rounding.';
