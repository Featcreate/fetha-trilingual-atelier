-- Make actual-fee registration idempotent by its provider evidence reference,
-- and allow one manual payout batch to include sales with historical commission rates.
-- Additive only: no existing financial rows are rewritten and no money is moved.

-- Refuse to add business-key uniqueness if prior data already contains duplicates.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.seller_external_fee_entries
    WHERE order_id IS NOT NULL
    GROUP BY store_id, order_id, external_reference
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'preflight_failed: duplicate_order_fee_evidence_references';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.seller_external_fee_entries
    WHERE order_id IS NULL
    GROUP BY store_id, external_reference
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'preflight_failed: duplicate_store_fee_evidence_references';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS seller_external_fee_order_reference_uidx
  ON public.seller_external_fee_entries(store_id, order_id, external_reference)
  WHERE order_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS seller_external_fee_store_reference_uidx
  ON public.seller_external_fee_entries(store_id, external_reference)
  WHERE order_id IS NULL;

-- Preserve the commission rate that was applied to each sale line. A payout-level
-- rate is only a weighted summary; it must not be used to validate individual lines.
ALTER TABLE public.seller_payout_items
  ADD COLUMN IF NOT EXISTS commission_bps integer;

-- Existing payout items are append-only. Temporarily remove only the guard
-- trigger inside this migration transaction to backfill the new immutable snapshot.
DROP TRIGGER IF EXISTS seller_payout_items_guard ON public.seller_payout_items;

UPDATE public.seller_payout_items pi
SET commission_bps = oi.commission_bps
FROM public.order_items oi
WHERE oi.id = pi.order_item_id
  AND pi.commission_bps IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.seller_payout_items WHERE commission_bps IS NULL) THEN
    RAISE EXCEPTION 'preflight_failed: payout_item_commission_rate_backfill_incomplete';
  END IF;
END;
$$;

ALTER TABLE public.seller_payout_items
  ALTER COLUMN commission_bps SET NOT NULL;

ALTER TABLE public.seller_payout_items
  ADD CONSTRAINT seller_payout_items_commission_bps_check
  CHECK (commission_bps BETWEEN 0 AND 10000);

COMMENT ON COLUMN public.seller_payout_items.commission_bps IS
  'Immutable commission rate actually applied to this individual order item; historical rates may differ within one payout.';

-- Validate each payout line against its own immutable order-item commission rate.
CREATE OR REPLACE FUNCTION public.guard_seller_payout_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _payout record;
  _ledger record;
  _item record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'payout_items_immutable';
  END IF;

  SELECT * INTO _payout
  FROM public.seller_payouts
  WHERE id = NEW.payout_id
  FOR UPDATE;
  IF NOT FOUND OR _payout.status <> 'pending' THEN
    RAISE EXCEPTION 'payout_not_open';
  END IF;

  SELECT * INTO _ledger
  FROM public.seller_ledger_entries
  WHERE id = NEW.ledger_entry_id;
  IF NOT FOUND OR _ledger.entry_type <> 'sale_net'
     OR _ledger.store_id <> _payout.store_id THEN
    RAISE EXCEPTION 'ledger_entry_mismatch';
  END IF;

  SELECT * INTO _item
  FROM public.order_items
  WHERE id = _ledger.order_item_id;
  IF NOT FOUND
     OR _item.store_id <> _payout.store_id
     OR _item.seller_id <> _ledger.seller_id
     OR _item.order_id IS NULL
     OR _item.seller_net_millimes <> _ledger.amount_millimes
     OR _item.payable_millimes <> _item.gross_millimes - _item.discount_millimes
     OR _item.commission_millimes <> round(_item.payable_millimes::numeric * _item.commission_bps / 10000)::bigint
     OR _item.seller_net_millimes <> _item.payable_millimes - _item.commission_millimes THEN
    RAISE EXCEPTION 'order_item_ledger_mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = _item.order_id
      AND o.status = 'paid'
      AND o.payment_mode = 'verified'
  ) THEN
    RAISE EXCEPTION 'sale_not_verified';
  END IF;

  IF NEW.order_item_id <> _item.id
     OR NEW.seller_amount_millimes <> _ledger.amount_millimes
     OR NEW.gross_millimes <> _item.gross_millimes
     OR NEW.discount_millimes <> _item.discount_millimes
     OR NEW.commission_millimes <> _item.commission_millimes
     OR NEW.commission_bps <> _item.commission_bps THEN
    RAISE EXCEPTION 'payout_item_amount_mismatch';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_seller_payout_item() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER seller_payout_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.seller_payout_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_seller_payout_item();

-- Record one seller-only fee. Repeated submissions with a new client request key
-- but the same store/evidence reference return the original fee instead of
-- creating another debit. A reused reference with different financial data fails.
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

  IF _order_id IS NULL THEN
    SELECT * INTO _existing
    FROM public.seller_external_fee_entries
    WHERE store_id = _store_id
      AND order_id IS NULL
      AND external_reference = trim(_external_reference)
    FOR UPDATE;
    IF FOUND THEN
      IF _existing.amount_millimes <> _amount_millimes
         OR _existing.fee_category <> _fee_category
         OR _existing.source <> trim(_source)
         OR _existing.description <> trim(_description) THEN
        RAISE EXCEPTION 'external_fee_business_reference_conflict';
      END IF;
      RETURN _existing.id;
    END IF;
  END IF;

  SELECT * INTO _existing
  FROM public.seller_external_fee_entries
  WHERE idempotency_key = trim(_idempotency_key)
  FOR UPDATE;
  IF FOUND THEN
    IF _existing.store_id <> _store_id
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

REVOKE ALL ON FUNCTION public.admin_record_seller_external_fee(uuid,text,bigint,text,text,text,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_record_seller_external_fee(uuid,text,bigint,text,text,text,text,uuid,uuid) TO authenticated;

-- A shared provider fee is keyed by the paid order and its external evidence
-- reference. The order row lock serializes retries and concurrent submissions.
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
  _existing_count integer;
  _existing_total bigint;
  _existing_valid boolean;
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
  ) THEN
    RAISE EXCEPTION 'invalid_external_fee_category';
  END IF;
  IF _source IS NULL OR length(trim(_source)) NOT BETWEEN 1 AND 80
     OR _external_reference IS NULL OR length(trim(_external_reference)) NOT BETWEEN 3 AND 200
     OR _description IS NULL OR length(trim(_description)) NOT BETWEEN 3 AND 500
     OR _idempotency_key IS NULL OR length(trim(_idempotency_key)) NOT BETWEEN 8 AND 150 THEN
    RAISE EXCEPTION 'external_fee_evidence_required';
  END IF;

  SELECT * INTO _order
  FROM public.orders
  WHERE id = _order_id
  FOR UPDATE;
  IF NOT FOUND OR _order.status <> 'paid'
     OR _order.payment_mode <> 'verified'
     OR _order.currency <> 'TND' THEN
    RAISE EXCEPTION 'shared_fee_requires_verified_paid_tnd_order';
  END IF;

  -- Serialize against payout creation and seller-only fee registration for every
  -- affected store. A payout cannot snapshot proceeds while this fee is pending.
  PERFORM s.id
  FROM public.stores s
  WHERE s.id IN (
    SELECT DISTINCT oi.store_id
    FROM public.order_items oi
    WHERE oi.order_id = _order_id
      AND oi.store_id IS NOT NULL
      AND oi.seller_id IS NOT NULL
      AND oi.payable_millimes > 0
  )
  ORDER BY s.id
  FOR UPDATE OF s;

  -- If this evidence reference was already applied to this order, validate the
  -- complete expected allocation and return it. Never create a second debit.
  SELECT count(*)::integer, coalesce(sum(f.amount_millimes), 0),
         coalesce(bool_and(f.fee_category = _fee_category AND f.source = trim(_source)), false)
  INTO _existing_count, _existing_total, _existing_valid
  FROM public.seller_external_fee_entries f
  WHERE f.order_id = _order_id
    AND f.external_reference = trim(_external_reference);

  IF _existing_count > 0 THEN
    IF _existing_total <> _amount_millimes OR NOT _existing_valid THEN
      RAISE EXCEPTION 'shared_external_fee_business_reference_conflict';
    END IF;

    IF EXISTS (
      WITH seller_weights AS (
        SELECT oi.store_id, oi.seller_id, sum(oi.payable_millimes)::numeric AS weight
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
      ),
      expected AS (
        SELECT store_id,
          base_amount + CASE WHEN remainder_rank <= remainder_units THEN 1 ELSE 0 END AS allocated_millimes
        FROM ranked
        WHERE base_amount + CASE WHEN remainder_rank <= remainder_units THEN 1 ELSE 0 END > 0
      )
      SELECT 1
      FROM expected e
      LEFT JOIN public.seller_external_fee_entries f
        ON f.store_id = e.store_id
       AND f.order_id = _order_id
       AND f.external_reference = trim(_external_reference)
      WHERE f.id IS NULL OR f.amount_millimes <> e.allocated_millimes
    ) OR EXISTS (
      SELECT 1
      FROM public.seller_external_fee_entries f
      WHERE f.order_id = _order_id
        AND f.external_reference = trim(_external_reference)
        AND NOT EXISTS (
          SELECT 1
          FROM public.order_items oi
          WHERE oi.order_id = _order_id
            AND oi.store_id = f.store_id
            AND oi.seller_id = f.seller_id
            AND oi.payable_millimes > 0
        )
    ) THEN
      RAISE EXCEPTION 'shared_external_fee_business_reference_conflict';
    END IF;

    RETURN _existing_count;
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

    INSERT INTO public.seller_external_fee_entries (
      store_id, seller_id, order_id, fee_category, amount_millimes, currency,
      source, external_reference, description, idempotency_key, recorded_by
    ) VALUES (
      _allocation.store_id, _allocation.seller_id, _order_id, _fee_category,
      _allocation.allocated_millimes, 'TND', trim(_source), trim(_external_reference),
      trim(_description) || ' | Proportional allocation based on each seller store''s paid order-item payable amount.',
      _entry_key, auth.uid()
    )
    RETURNING id INTO _fee_id;

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

  IF _inserted = 0 THEN
    RAISE EXCEPTION 'no_eligible_seller_order_items';
  END IF;
  RETURN _inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_shared_seller_fee(uuid,text,bigint,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_record_shared_seller_fee(uuid,text,bigint,text,text,text,text) TO authenticated;

-- Create one payout from every currently unbatched verified sale line for a
-- store, regardless of the commission rate captured on each historical sale.
-- seller_payouts.commission_bps is the weighted effective summary rate;
-- seller_payout_items.commission_bps preserves the exact rate for each line.
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
  IF NOT FOUND THEN
    RAISE EXCEPTION 'store_not_found';
  END IF;

  SELECT * INTO _existing
  FROM public.seller_payouts
  WHERE idempotency_key = trim(_idempotency_key);
  IF FOUND THEN
    IF _existing.store_id <> _store_id THEN
      RAISE EXCEPTION 'idempotency_key_conflict';
    END IF;
    RETURN _existing.id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.seller_payout_preferences
    WHERE store_id = _store_id AND method <> 'weekly_manual'
  ) THEN
    RAISE EXCEPTION 'unsupported_payout_method';
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

  -- Weighted effective rate for display only; line-level rates remain on items.
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
  IF _seller_amount <= 0 THEN
    RAISE EXCEPTION 'no_positive_payout_after_external_fees';
  END IF;

  INSERT INTO public.seller_payouts (
    store_id, method, status, currency, gross_millimes, discount_millimes,
    commission_bps, commission_millimes, seller_amount_millimes,
    external_fees_millimes, idempotency_key, provider, scheduled_for
  ) VALUES (
    _store_id, 'weekly_manual', 'pending', 'TND', _gross, _discount,
    _commission_bps, _commission, _seller_amount,
    _external_fees, trim(_idempotency_key), 'manual', _scheduled_for
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
GRANT EXECUTE ON FUNCTION public.admin_create_seller_payout(uuid,text,timestamptz) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_create_seller_payout(uuid,text,timestamptz) IS
  'Admin-only weekly manual payout. Batches all unbatched verified sales across historical commission rates; stores the exact rate per payout item and a weighted summary on the payout header.';

