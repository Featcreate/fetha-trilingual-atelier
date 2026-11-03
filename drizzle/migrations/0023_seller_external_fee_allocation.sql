-- Seller-borne external fees: immutable fee evidence, seller ledger visibility,
-- fee allocation at payout creation, and final payout amount after fees.
-- This migration does not enable checkout or initiate real transfers.

ALTER TABLE public.seller_payouts
  ADD COLUMN IF NOT EXISTS external_fees_millimes bigint NOT NULL DEFAULT 0
    CHECK (external_fees_millimes >= 0);

CREATE TABLE public.seller_external_fee_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE RESTRICT,
  fee_category text NOT NULL CHECK (fee_category IN (
    'payment_processing','payment_collection','currency_conversion',
    'provider_settlement','seller_transfer','receiving','withdrawal','other'
  )),
  amount_millimes bigint NOT NULL CHECK (amount_millimes > 0),
  currency text NOT NULL DEFAULT 'TND' CHECK (currency = 'TND'),
  source text NOT NULL CHECK (length(trim(source)) BETWEEN 1 AND 80),
  external_reference text NOT NULL CHECK (length(trim(external_reference)) BETWEEN 3 AND 200),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 3 AND 500),
  idempotency_key text NOT NULL UNIQUE CHECK (length(trim(idempotency_key)) BETWEEN 8 AND 200),
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_external_fee_order_item_scope CHECK (order_item_id IS NULL OR order_id IS NOT NULL)
);

CREATE INDEX seller_external_fee_store_created_idx
  ON public.seller_external_fee_entries(store_id, created_at DESC);
CREATE INDEX seller_external_fee_seller_created_idx
  ON public.seller_external_fee_entries(seller_id, created_at DESC);
CREATE INDEX seller_external_fee_order_idx
  ON public.seller_external_fee_entries(order_id)
  WHERE order_id IS NOT NULL;

CREATE TABLE public.seller_payout_fee_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fee_entry_id uuid NOT NULL REFERENCES public.seller_external_fee_entries(id) ON DELETE RESTRICT,
  payout_id uuid NOT NULL REFERENCES public.seller_payouts(id) ON DELETE RESTRICT,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  amount_millimes bigint NOT NULL CHECK (amount_millimes > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fee_entry_id, payout_id)
);

CREATE INDEX seller_payout_fee_allocations_payout_idx
  ON public.seller_payout_fee_allocations(payout_id);
CREATE INDEX seller_payout_fee_allocations_store_idx
  ON public.seller_payout_fee_allocations(store_id, created_at DESC);

ALTER TABLE public.seller_external_fee_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_payout_fee_allocations ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.seller_external_fee_entries, public.seller_payout_fee_allocations TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.seller_external_fee_entries,
  public.seller_payout_fee_allocations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.seller_external_fee_entries, public.seller_payout_fee_allocations TO service_role;

CREATE POLICY "Sellers and admins read external fee entries"
  ON public.seller_external_fee_entries FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = seller_external_fee_entries.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Sellers and admins read payout fee allocations"
  ON public.seller_payout_fee_allocations FOR SELECT TO authenticated
  USING (
    public.has_role((SELECT auth.uid()), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = seller_payout_fee_allocations.store_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

CREATE OR REPLACE FUNCTION public.prevent_seller_external_fee_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'seller_external_fee_entries_are_append_only';
END;
$$;

CREATE TRIGGER seller_external_fee_entries_append_only
  BEFORE UPDATE OR DELETE ON public.seller_external_fee_entries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_seller_external_fee_mutation();

CREATE TRIGGER seller_payout_fee_allocations_append_only
  BEFORE UPDATE OR DELETE ON public.seller_payout_fee_allocations
  FOR EACH ROW EXECUTE FUNCTION public.prevent_seller_external_fee_mutation();

REVOKE ALL ON FUNCTION public.prevent_seller_external_fee_mutation() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_seller_external_fee_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _owner_id uuid;
  _item_order_id uuid;
  _item_store_id uuid;
  _item_seller_id uuid;
BEGIN
  SELECT s.owner_id INTO _owner_id
  FROM public.stores s WHERE s.id = NEW.store_id;
  IF NOT FOUND OR _owner_id IS DISTINCT FROM NEW.seller_id THEN
    RAISE EXCEPTION 'seller_external_fee_store_owner_mismatch';
  END IF;

  IF NEW.order_item_id IS NOT NULL THEN
    SELECT oi.order_id, oi.store_id, oi.seller_id
      INTO _item_order_id, _item_store_id, _item_seller_id
    FROM public.order_items oi WHERE oi.id = NEW.order_item_id;
    IF NOT FOUND
       OR _item_order_id IS DISTINCT FROM NEW.order_id
       OR _item_store_id IS DISTINCT FROM NEW.store_id
       OR _item_seller_id IS DISTINCT FROM NEW.seller_id THEN
      RAISE EXCEPTION 'seller_external_fee_order_item_mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER seller_external_fee_scope_guard
  BEFORE INSERT ON public.seller_external_fee_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_seller_external_fee_scope();
REVOKE ALL ON FUNCTION public.guard_seller_external_fee_scope() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_seller_payout_fee_allocation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _fee public.seller_external_fee_entries%ROWTYPE;
  _payout public.seller_payouts%ROWTYPE;
  _allocated bigint;
BEGIN
  SELECT * INTO _fee FROM public.seller_external_fee_entries
  WHERE id = NEW.fee_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'external_fee_not_found'; END IF;

  SELECT * INTO _payout FROM public.seller_payouts
  WHERE id = NEW.payout_id FOR UPDATE;
  IF NOT FOUND OR _payout.status <> 'pending' THEN
    RAISE EXCEPTION 'payout_not_open_for_fee_allocation';
  END IF;
  IF _fee.store_id <> NEW.store_id OR _payout.store_id <> NEW.store_id THEN
    RAISE EXCEPTION 'external_fee_payout_store_mismatch';
  END IF;

  SELECT coalesce(sum(a.amount_millimes), 0) INTO _allocated
  FROM public.seller_payout_fee_allocations a
  WHERE a.fee_entry_id = NEW.fee_entry_id;
  IF _allocated + NEW.amount_millimes > _fee.amount_millimes THEN
    RAISE EXCEPTION 'external_fee_overallocated';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER seller_payout_fee_allocation_guard
  BEFORE INSERT ON public.seller_payout_fee_allocations
  FOR EACH ROW EXECUTE FUNCTION public.guard_seller_payout_fee_allocation();
REVOKE ALL ON FUNCTION public.guard_seller_payout_fee_allocation() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.seller_external_fee_entries IS
  'Immutable, evidence-backed external fees borne by the seller, separate from platform commission. Amounts are recorded in TND millimes only.';
COMMENT ON TABLE public.seller_payout_fee_allocations IS
  'Immutable allocation of actual seller-borne external fee entries to a manual seller payout. Prevents duplicate deductions.';
COMMENT ON COLUMN public.seller_payouts.external_fees_millimes IS
  'Snapshot of actual seller-borne external fees allocated to this payout; distinct from commission and deducted once from seller proceeds.';

-- Only an authenticated platform administrator can record an actual fee.
-- An external statement/transaction reference is mandatory; estimates are not accepted.
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
  ) THEN RAISE EXCEPTION 'invalid_external_fee_category'; END IF;
  IF _source IS NULL OR length(trim(_source)) NOT BETWEEN 1 AND 80
     OR _external_reference IS NULL OR length(trim(_external_reference)) NOT BETWEEN 3 AND 200
     OR _description IS NULL OR length(trim(_description)) NOT BETWEEN 3 AND 500
     OR _idempotency_key IS NULL OR length(trim(_idempotency_key)) NOT BETWEEN 8 AND 200 THEN
    RAISE EXCEPTION 'external_fee_evidence_required';
  END IF;

  SELECT s.owner_id INTO _seller_id FROM public.stores s
  WHERE s.id = _store_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'store_not_found'; END IF;

  SELECT * INTO _existing FROM public.seller_external_fee_entries
  WHERE idempotency_key = trim(_idempotency_key);
  IF FOUND THEN
    IF _existing.store_id <> _store_id
       OR _existing.amount_millimes <> _amount_millimes
       OR _existing.external_reference <> trim(_external_reference) THEN
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
  ) RETURNING id INTO _fee_id;

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

-- Payouts now snapshot and deduct all not-yet-allocated actual fees.
-- If fees exceed currently available seller proceeds, no payout is created;
-- fees remain outstanding and can be settled from later sales.
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
  IF NOT FOUND THEN RAISE EXCEPTION 'store_not_found'; END IF;

  SELECT * INTO _existing FROM public.seller_payouts WHERE idempotency_key = trim(_idempotency_key);
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

  SELECT coalesce(sum(oi.gross_millimes),0),
         coalesce(sum(oi.discount_millimes),0),
         coalesce(sum(oi.commission_millimes),0),
         coalesce(sum(le.amount_millimes),0)
    INTO _gross, _discount, _commission, _seller_gross
  FROM public.seller_ledger_entries le
  JOIN public.order_items oi ON oi.id = le.order_item_id
  JOIN public.orders o ON o.id = oi.order_id
  WHERE le.store_id = _store_id AND le.entry_type = 'sale_net'
    AND oi.commission_bps = _commission_bps
    AND o.status = 'paid' AND o.payment_mode = 'verified'
    AND NOT EXISTS (SELECT 1 FROM public.seller_payout_items pi WHERE pi.ledger_entry_id = le.id);

  SELECT coalesce(sum(f.amount_millimes - coalesce(a.allocated,0)),0)
    INTO _external_fees
  FROM public.seller_external_fee_entries f
  LEFT JOIN LATERAL (
    SELECT sum(x.amount_millimes) AS allocated
    FROM public.seller_payout_fee_allocations x WHERE x.fee_entry_id = f.id
  ) a ON true
  WHERE f.store_id = _store_id
    AND f.amount_millimes > coalesce(a.allocated,0);

  IF _seller_gross <= 0 OR _gross <> _discount + _commission + _seller_gross THEN
    RAISE EXCEPTION 'payout_amount_reconciliation_failed';
  END IF;
  IF _external_fees > _seller_gross THEN
    RAISE EXCEPTION 'external_fees_exceed_available_seller_balance';
  END IF;
  _seller_amount := _seller_gross - _external_fees;
  IF _seller_amount <= 0 THEN RAISE EXCEPTION 'no_positive_payout_after_external_fees'; END IF;

  INSERT INTO public.seller_payouts (
    store_id, method, status, currency, gross_millimes, discount_millimes,
    commission_bps, commission_millimes, seller_amount_millimes,
    external_fees_millimes, idempotency_key, provider, scheduled_for
  ) VALUES (
    _store_id, 'weekly_manual', 'pending', 'TND', _gross, _discount,
    _commission_bps, _commission, _seller_amount,
    _external_fees, trim(_idempotency_key), 'manual', _scheduled_for
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

  FOR _fee IN
    SELECT f.id, f.amount_millimes - coalesce(sum(a.amount_millimes),0) AS remaining
    FROM public.seller_external_fee_entries f
    LEFT JOIN public.seller_payout_fee_allocations a ON a.fee_entry_id = f.id
    WHERE f.store_id = _store_id
    GROUP BY f.id, f.amount_millimes, f.created_at
    HAVING f.amount_millimes > coalesce(sum(a.amount_millimes),0)
    ORDER BY f.created_at, f.id
    FOR UPDATE OF f
  LOOP
    _remaining := _fee.remaining;
    INSERT INTO public.seller_payout_fee_allocations (
      fee_entry_id, payout_id, store_id, amount_millimes
    ) VALUES (_fee.id, _payout_id, _store_id, _remaining);
  END LOOP;

  IF (SELECT count(*) FROM public.seller_payout_items WHERE payout_id = _payout_id) = 0
     OR (SELECT coalesce(sum(amount_millimes),0) FROM public.seller_payout_fee_allocations WHERE payout_id = _payout_id) <> _external_fees THEN
    RAISE EXCEPTION 'payout_fee_allocation_reconciliation_failed';
  END IF;
  RETURN _payout_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_seller_payout(uuid,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_seller_payout(uuid,text,timestamptz) TO authenticated;

-- Financial snapshots cannot be edited after payout creation. The seller amount
-- is gross proceeds after commission and then minus the separately snapshotted fees.
CREATE OR REPLACE FUNCTION public.guard_seller_payout_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (NEW.id, NEW.store_id, NEW.method, NEW.currency, NEW.gross_millimes, NEW.discount_millimes,
      NEW.commission_bps, NEW.commission_millimes, NEW.seller_amount_millimes,
      NEW.external_fees_millimes, NEW.idempotency_key, NEW.provider, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.store_id, OLD.method, OLD.currency, OLD.gross_millimes, OLD.discount_millimes,
      OLD.commission_bps, OLD.commission_millimes, OLD.seller_amount_millimes,
      OLD.external_fees_millimes, OLD.idempotency_key, OLD.provider, OLD.created_at) THEN
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
       OR NEW.seller_amount_millimes <> (
         (SELECT coalesce(sum(seller_amount_millimes),0) FROM public.seller_payout_items WHERE payout_id = NEW.id)
         - NEW.external_fees_millimes
       )
       OR NEW.external_fees_millimes <> (
         SELECT coalesce(sum(amount_millimes),0)
         FROM public.seller_payout_fee_allocations WHERE payout_id = NEW.id
       ) THEN
      RAISE EXCEPTION 'payout_items_total_mismatch';
    END IF;
  END IF;
  IF NEW.status = 'paid' AND (NEW.paid_at IS NULL
      OR length(trim(coalesce(NEW.provider_transfer_ref,''))) = 0) THEN
    RAISE EXCEPTION 'payout_confirmation_required';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- A payout is eligible only after a verified, manually initiated transfer.
-- Existing admin_mark_seller_payout_paid remains responsible for posting the
-- final seller_amount_millimes snapshot to the central platform ledger.

COMMENT ON COLUMN public.seller_payouts.seller_amount_millimes IS
  'Final manual transfer amount after platform commission and verified seller-borne external fees.';
