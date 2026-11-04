-- Separate seller-selected payout destination from the platform's weekly manual
-- settlement rail. This migration only changes source code/schema definitions;
-- it does not run against any Supabase project or initiate a transfer.

-- The preference method is a destination, not a transfer mechanism.
ALTER TABLE public.seller_payout_preferences
  ALTER COLUMN method DROP DEFAULT;
-- Drop the legacy enum-valued RLS expression before changing the column type.
DROP POLICY IF EXISTS "Sellers manage own payout preference" ON public.seller_payout_preferences;
ALTER TABLE public.seller_payout_preferences
  DROP CONSTRAINT IF EXISTS seller_payout_preferences_wallet_check;
ALTER TABLE public.seller_payout_preferences
  DROP CONSTRAINT IF EXISTS seller_payout_preferences_platform_only;
ALTER TABLE public.seller_payout_preferences
  ALTER COLUMN method TYPE text USING method::text;
UPDATE public.seller_payout_preferences
SET method = 'other',
    konnect_wallet_id = NULL
WHERE method IN ('weekly_manual', 'konnect_direct');
ALTER TABLE public.seller_payout_preferences
  ALTER COLUMN method SET DEFAULT 'other',
  ADD CONSTRAINT seller_payout_preferences_method_check
    CHECK (method IN ('ipay', 'wepay', 'bank_transfer', 'other')),
  ADD COLUMN IF NOT EXISTS account_holder_name text,
  ADD COLUMN IF NOT EXISTS provider_name text,
  ADD COLUMN IF NOT EXISTS account_identifier text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS additional_details text;

-- Keep existing rows readable while requiring complete destination data for
-- any newly saved preference. Never store passwords, PINs, OTPs, or API secrets.
ALTER TABLE public.seller_payout_preferences
  ADD CONSTRAINT seller_payout_preferences_destination_check
  CHECK (
    (account_holder_name IS NULL OR length(trim(account_holder_name)) BETWEEN 2 AND 160)
    AND (provider_name IS NULL OR length(trim(provider_name)) BETWEEN 2 AND 120)
    AND (account_identifier IS NULL OR length(trim(account_identifier)) BETWEEN 3 AND 200)
    AND (bank_name IS NULL OR length(trim(bank_name)) BETWEEN 2 AND 160)
    AND (additional_details IS NULL OR length(trim(additional_details)) <= 500)
  );

-- The payout header stores an immutable destination snapshot. Later seller
-- preference edits must not redirect an already-created weekly payout.
ALTER TABLE public.seller_payouts
  ADD COLUMN IF NOT EXISTS payout_destination_method text,
  ADD COLUMN IF NOT EXISTS payout_account_holder_name text,
  ADD COLUMN IF NOT EXISTS payout_provider_name text,
  ADD COLUMN IF NOT EXISTS payout_account_identifier text,
  ADD COLUMN IF NOT EXISTS payout_bank_name text,
  ADD COLUMN IF NOT EXISTS payout_additional_details text,
  ADD CONSTRAINT seller_payout_destination_snapshot_check CHECK (
    (payout_destination_method IS NULL
      AND payout_account_holder_name IS NULL
      AND payout_provider_name IS NULL
      AND payout_account_identifier IS NULL
      AND payout_bank_name IS NULL
      AND payout_additional_details IS NULL)
    OR
    (payout_destination_method IN ('ipay', 'wepay', 'bank_transfer', 'other')
      AND payout_account_holder_name IS NOT NULL
      AND payout_account_identifier IS NOT NULL)
  );

-- Replace the legacy policy that allowed only the weekly_manual enum value.
-- Sellers may edit only their own active store's receiving destination.
DROP POLICY IF EXISTS "Sellers manage own payout preference" ON public.seller_payout_preferences;
CREATE POLICY "Sellers manage own payout preference"
  ON public.seller_payout_preferences FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = seller_payout_preferences.store_id
        AND s.owner_id = (SELECT auth.uid())
        AND s.status = 'active'
    )
  )
  WITH CHECK (
    method IN ('ipay', 'wepay', 'bank_transfer', 'other')
    AND EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = seller_payout_preferences.store_id
        AND s.owner_id = (SELECT auth.uid())
        AND s.status = 'active'
    )
  );

COMMENT ON COLUMN public.seller_payout_preferences.method IS
  'Seller-selected receiving destination: iPay, WePay, bank transfer, or another supported method. Weekly manual is the platform settlement cadence, not a destination.';
COMMENT ON COLUMN public.seller_payouts.payout_destination_method IS
  'Immutable snapshot of the seller-selected receiving destination at weekly payout batch creation.';
COMMENT ON COLUMN public.seller_payouts.payout_account_identifier IS
  'Private destination identifier snapshot visible only to the owning seller and platform administrators.';

CREATE OR REPLACE FUNCTION public.guard_seller_payout_preference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    IF TG_OP = 'UPDATE' AND NEW.store_id IS DISTINCT FROM OLD.store_id THEN
      RAISE EXCEPTION 'payout_store_immutable';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = NEW.store_id
        AND s.owner_id = auth.uid()
        AND s.status = 'active'
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  IF NEW.method NOT IN ('ipay', 'wepay', 'bank_transfer', 'other') THEN
    RAISE EXCEPTION 'unsupported_payout_destination';
  END IF;
  IF NEW.account_holder_name IS NULL
     OR length(trim(NEW.account_holder_name)) NOT BETWEEN 2 AND 160
     OR NEW.account_identifier IS NULL
     OR length(trim(NEW.account_identifier)) NOT BETWEEN 3 AND 200 THEN
    RAISE EXCEPTION 'payout_destination_details_required';
  END IF;
  IF NEW.provider_name IS NOT NULL AND length(trim(NEW.provider_name)) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'invalid_payout_provider_name';
  END IF;
  IF NEW.bank_name IS NOT NULL AND length(trim(NEW.bank_name)) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'invalid_payout_bank_name';
  END IF;
  IF NEW.additional_details IS NOT NULL AND length(NEW.additional_details) > 500 THEN
    RAISE EXCEPTION 'payout_additional_details_too_long';
  END IF;

  NEW.account_holder_name := trim(NEW.account_holder_name);
  NEW.account_identifier := trim(NEW.account_identifier);
  NEW.provider_name := nullif(trim(coalesce(NEW.provider_name, '')), '');
  NEW.bank_name := nullif(trim(coalesce(NEW.bank_name, '')), '');
  NEW.additional_details := nullif(trim(coalesce(NEW.additional_details, '')), '');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_seller_payout_preference() FROM PUBLIC, anon, authenticated;

-- Attach the validation/ownership guard to every seller preference write.
DROP TRIGGER IF EXISTS seller_payout_preferences_guard
  ON public.seller_payout_preferences;
CREATE TRIGGER seller_payout_preferences_guard
  BEFORE INSERT OR UPDATE ON public.seller_payout_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_seller_payout_preference();

-- Build the weekly batch from verified sales, allocate only evidenced external
-- fees once, and snapshot the current seller-selected destination.
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
GRANT EXECUTE ON FUNCTION public.admin_create_seller_payout(uuid,text,timestamptz) TO authenticated, service_role;

-- Keep all financial and destination snapshots immutable after batch creation.
CREATE OR REPLACE FUNCTION public.guard_seller_payout_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF (NEW.id, NEW.store_id, NEW.method, NEW.currency, NEW.gross_millimes, NEW.discount_millimes,
      NEW.commission_bps, NEW.commission_millimes, NEW.seller_amount_millimes,
      NEW.external_fees_millimes, NEW.idempotency_key, NEW.provider, NEW.created_at,
      NEW.payout_destination_method, NEW.payout_account_holder_name,
      NEW.payout_provider_name, NEW.payout_account_identifier,
      NEW.payout_bank_name, NEW.payout_additional_details)
     IS DISTINCT FROM
     (OLD.id, OLD.store_id, OLD.method, OLD.currency, OLD.gross_millimes, OLD.discount_millimes,
      OLD.commission_bps, OLD.commission_millimes, OLD.seller_amount_millimes,
      OLD.external_fees_millimes, OLD.idempotency_key, OLD.provider, OLD.created_at,
      OLD.payout_destination_method, OLD.payout_account_holder_name,
      OLD.payout_provider_name, OLD.payout_account_identifier,
      OLD.payout_bank_name, OLD.payout_additional_details) THEN
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

REVOKE ALL ON FUNCTION public.guard_seller_payout_update() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.admin_create_seller_payout(uuid,text,timestamptz) IS
  'Admin-only weekly manual seller payout. Seller-selected receiving destination and its details are snapshotted; verified actual seller-borne fees are allocated once and deducted separately from the 5% platform commission.';
