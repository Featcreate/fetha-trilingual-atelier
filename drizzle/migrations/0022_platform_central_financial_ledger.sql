-- Central platform accounting for worldwide buyer collections.
-- This migration is additive: it does not enable checkout, connect a provider,
-- initiate a transfer, or move real money. All seller payout execution remains
-- controlled by Algorea Bazaar and is currently weekly/manual.
--
-- Canonical seller accounting remains TND during the Tunisia-seller phase.
-- Buyer charge currency and provider settlement details are snapshotted separately.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS buyer_currency text
    CHECK (buyer_currency IS NULL OR buyer_currency ~ '^[A-Z]{3}$'),
  ADD COLUMN IF NOT EXISTS buyer_amount_minor bigint
    CHECK (buyer_amount_minor IS NULL OR buyer_amount_minor > 0),
  ADD COLUMN IF NOT EXISTS buyer_currency_exponent smallint
    CHECK (buyer_currency_exponent IS NULL OR buyer_currency_exponent BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS platform_settlement_currency text NOT NULL DEFAULT 'TND'
    CHECK (platform_settlement_currency ~ '^[A-Z]{3}$'),
  ADD COLUMN IF NOT EXISTS platform_settlement_amount_millimes bigint
    CHECK (platform_settlement_amount_millimes IS NULL OR platform_settlement_amount_millimes > 0),
  ADD COLUMN IF NOT EXISTS buyer_fx_rate numeric(24,12)
    CHECK (buyer_fx_rate IS NULL OR buyer_fx_rate > 0),
  ADD COLUMN IF NOT EXISTS buyer_fx_rate_source text
    CHECK (buyer_fx_rate_source IS NULL OR length(buyer_fx_rate_source) BETWEEN 1 AND 120),
  ADD COLUMN IF NOT EXISTS buyer_fx_quoted_at timestamptz;

COMMENT ON COLUMN public.orders.total_millimes IS
  'Canonical order value in TND millimes used for seller accounting and commission calculations.';
COMMENT ON COLUMN public.orders.buyer_amount_minor IS
  'Immutable buyer-facing charge amount in buyer_currency minor units; populated only when a provider/currency flow is approved.';
COMMENT ON COLUMN public.orders.platform_settlement_amount_millimes IS
  'Actual or verified provider settlement value expressed in TND millimes; distinct from the buyer charge amount.';
COMMENT ON COLUMN public.orders.buyer_fx_rate IS
  'Immutable FX snapshot: TND per one unit of buyer_currency, captured for this order. Never recompute historical orders.';

ALTER TABLE public.orders
  ADD CONSTRAINT orders_buyer_amount_snapshot_complete CHECK (
    (buyer_currency IS NULL AND buyer_amount_minor IS NULL AND buyer_currency_exponent IS NULL)
    OR (buyer_currency IS NOT NULL AND buyer_amount_minor IS NOT NULL AND buyer_currency_exponent IS NOT NULL)
  ),
  ADD CONSTRAINT orders_foreign_buyer_fx_snapshot_complete CHECK (
    buyer_currency IS NULL OR buyer_currency = 'TND'
    OR (buyer_fx_rate IS NOT NULL AND buyer_fx_rate_source IS NOT NULL AND buyer_fx_quoted_at IS NOT NULL)
  );

CREATE TABLE public.platform_financial_ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type text NOT NULL CHECK (entry_type IN (
    'buyer_collection',
    'provider_settlement',
    'platform_commission',
    'seller_payable',
    'seller_payout',
    'provider_fee',
    'fx_conversion',
    'refund',
    'chargeback',
    'adjustment'
  )),
  entry_side text NOT NULL CHECK (entry_side IN ('debit','credit')),
  order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  order_item_id uuid REFERENCES public.order_items(id) ON DELETE RESTRICT,
  seller_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  store_id uuid REFERENCES public.stores(id) ON DELETE RESTRICT,
  transaction_currency text NOT NULL CHECK (transaction_currency ~ '^[A-Z]{3}$'),
  transaction_amount_minor bigint NOT NULL CHECK (transaction_amount_minor > 0),
  transaction_currency_exponent smallint NOT NULL CHECK (transaction_currency_exponent BETWEEN 0 AND 3),
  accounting_currency text NOT NULL DEFAULT 'TND' CHECK (accounting_currency = 'TND'),
  accounting_amount_millimes bigint NOT NULL CHECK (accounting_amount_millimes > 0),
  fx_rate numeric(24,12) CHECK (fx_rate IS NULL OR fx_rate > 0),
  fx_rate_source text CHECK (fx_rate_source IS NULL OR length(fx_rate_source) BETWEEN 1 AND 120),
  fx_rate_at timestamptz,
  source text NOT NULL CHECK (length(trim(source)) BETWEEN 1 AND 80),
  external_reference text,
  idempotency_key text NOT NULL UNIQUE CHECK (length(trim(idempotency_key)) BETWEEN 8 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_financial_ledger_order_item_type_check CHECK (
    entry_type NOT IN ('platform_commission','seller_payable') OR order_item_id IS NOT NULL
  ),
  CONSTRAINT platform_financial_ledger_seller_scope_check CHECK (
    (seller_id IS NULL AND store_id IS NULL) OR (seller_id IS NOT NULL AND store_id IS NOT NULL)
  )
);

CREATE INDEX platform_financial_ledger_order_idx
  ON public.platform_financial_ledger_entries(order_id, created_at DESC)
  WHERE order_id IS NOT NULL;
CREATE INDEX platform_financial_ledger_seller_idx
  ON public.platform_financial_ledger_entries(seller_id, created_at DESC)
  WHERE seller_id IS NOT NULL;
CREATE INDEX platform_financial_ledger_type_idx
  ON public.platform_financial_ledger_entries(entry_type, created_at DESC);

ALTER TABLE public.platform_financial_ledger_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_financial_ledger_entries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_financial_ledger_entries TO authenticated;
GRANT ALL ON TABLE public.platform_financial_ledger_entries TO service_role;

CREATE POLICY "Admins read platform financial ledger"
  ON public.platform_financial_ledger_entries FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));

CREATE OR REPLACE FUNCTION public.prevent_platform_financial_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'platform_financial_ledger_is_append_only';
END;
$$;

CREATE TRIGGER platform_financial_ledger_append_only
  BEFORE UPDATE OR DELETE ON public.platform_financial_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.prevent_platform_financial_ledger_mutation();

REVOKE ALL ON FUNCTION public.prevent_platform_financial_ledger_mutation() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.platform_financial_ledger_entries IS
  'Append-only internal accounting record for buyer collections, provider settlement, platform commission, seller payables and platform-controlled payouts. This is a ledger, not a bank account or payment instrument. No provider is authorized to split or pay sellers.';

-- Replace the trusted settlement function so verified collections, commission,
-- and seller payables are posted to the platform ledger in the same transaction.
-- Simulation mode deliberately creates no financial ledger entries.
CREATE OR REPLACE FUNCTION public.settle_order_payment(
  _order_id uuid,
  _mode text,
  _payment_ref text,
  _amount_millimes integer,
  _source text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  o record;
  _now timestamptz := now();
BEGIN
  IF _mode NOT IN ('verified','simulation') THEN
    RAISE EXCEPTION 'invalid_mode';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'unknown_order'; END IF;

  IF o.status = 'paid' THEN
    INSERT INTO public.payment_events (order_id, payment_ref, source, outcome, payment_mode)
    VALUES (o.id, _payment_ref, _source, 'already_paid', _mode);
    RETURN 'already_paid';
  END IF;
  IF o.status <> 'pending' THEN RETURN 'order_closed'; END IF;

  IF _amount_millimes IS DISTINCT FROM o.total_millimes THEN
    INSERT INTO public.payment_events (order_id, payment_ref, source, outcome, payment_mode)
    VALUES (o.id, _payment_ref, _source, 'mismatch', _mode);
    RETURN 'mismatch';
  END IF;

  UPDATE public.orders
  SET status = 'paid', paid_at = _now, payment_mode = _mode,
      payment_confirmation_ref = _payment_ref
  WHERE id = o.id;

  INSERT INTO public.download_entitlements
    (order_id, order_item_file_id, user_id, starts_at, expires_at)
  SELECT o.id, f.id, o.user_id, _now, _now + interval '7 days'
  FROM public.order_item_files f
  JOIN public.order_items i ON i.id = f.order_item_id
  WHERE i.order_id = o.id
  ON CONFLICT (order_item_file_id) DO NOTHING;

  IF _mode = 'verified' THEN
    INSERT INTO public.seller_ledger_entries
      (order_item_id, store_id, seller_id, entry_type, amount_millimes)
    SELECT i.id, i.store_id, i.seller_id, 'sale_net', i.seller_net_millimes
    FROM public.order_items i
    WHERE i.order_id = o.id
    ON CONFLICT (order_item_id, entry_type) DO NOTHING;

    -- Platform cash/collection side of the journal.
    INSERT INTO public.platform_financial_ledger_entries (
      entry_type, entry_side, order_id,
      transaction_currency, transaction_amount_minor, transaction_currency_exponent,
      accounting_currency, accounting_amount_millimes,
      fx_rate, fx_rate_source, fx_rate_at,
      source, external_reference, idempotency_key
    ) VALUES (
      'buyer_collection', 'debit', o.id,
      'TND', o.total_millimes, 3,
      'TND', o.total_millimes,
      1, 'TND_base_order', _now,
      'verified_payment_settlement', _payment_ref,
      'order:' || o.id::text || ':buyer_collection'
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    -- Platform commission and seller payable are separate credits per item.
    INSERT INTO public.platform_financial_ledger_entries (
      entry_type, entry_side, order_id, order_item_id, seller_id, store_id,
      transaction_currency, transaction_amount_minor, transaction_currency_exponent,
      accounting_currency, accounting_amount_millimes,
      fx_rate, fx_rate_source, fx_rate_at,
      source, external_reference, idempotency_key
    )
    SELECT
      'platform_commission', 'credit', o.id, i.id, i.seller_id, i.store_id,
      'TND', i.commission_millimes, 3,
      'TND', i.commission_millimes,
      1, 'TND_base_order', _now,
      'verified_payment_settlement', _payment_ref,
      'order_item:' || i.id::text || ':platform_commission'
    FROM public.order_items i
    WHERE i.order_id = o.id AND coalesce(i.commission_millimes, 0) > 0
    ON CONFLICT (idempotency_key) DO NOTHING;

    INSERT INTO public.platform_financial_ledger_entries (
      entry_type, entry_side, order_id, order_item_id, seller_id, store_id,
      transaction_currency, transaction_amount_minor, transaction_currency_exponent,
      accounting_currency, accounting_amount_millimes,
      fx_rate, fx_rate_source, fx_rate_at,
      source, external_reference, idempotency_key
    )
    SELECT
      'seller_payable', 'credit', o.id, i.id, i.seller_id, i.store_id,
      'TND', i.seller_net_millimes, 3,
      'TND', i.seller_net_millimes,
      1, 'TND_base_order', _now,
      'verified_payment_settlement', _payment_ref,
      'order_item:' || i.id::text || ':seller_payable'
    FROM public.order_items i
    WHERE i.order_id = o.id AND coalesce(i.seller_net_millimes, 0) > 0
    ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  INSERT INTO public.payment_events (order_id, payment_ref, source, outcome, payment_mode)
  VALUES (o.id, _payment_ref, _source, 'paid', _mode);
  RETURN 'paid';
END;
$$;

REVOKE ALL ON FUNCTION public.settle_order_payment(uuid, text, text, integer, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_order_payment(uuid, text, text, integer, text)
  TO service_role;

-- Backfill the platform ledger for any previously verified paid orders.
-- Unique idempotency keys make this safe if the migration is reviewed/replayed
-- in a disposable environment before production rollout.
INSERT INTO public.platform_financial_ledger_entries (
  entry_type, entry_side, order_id,
  transaction_currency, transaction_amount_minor, transaction_currency_exponent,
  accounting_currency, accounting_amount_millimes,
  fx_rate, fx_rate_source, fx_rate_at,
  source, external_reference, idempotency_key
)
SELECT
  'buyer_collection', 'debit', o.id,
  'TND', o.total_millimes, 3,
  'TND', o.total_millimes,
  1, 'TND_base_order', coalesce(o.paid_at, o.created_at),
  'verified_payment_backfill', o.payment_confirmation_ref,
  'order:' || o.id::text || ':buyer_collection'
FROM public.orders o
WHERE o.status = 'paid' AND o.payment_mode = 'verified'
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO public.platform_financial_ledger_entries (
  entry_type, entry_side, order_id, order_item_id, seller_id, store_id,
  transaction_currency, transaction_amount_minor, transaction_currency_exponent,
  accounting_currency, accounting_amount_millimes,
  fx_rate, fx_rate_source, fx_rate_at,
  source, external_reference, idempotency_key
)
SELECT
  'platform_commission', 'credit', o.id, i.id, i.seller_id, i.store_id,
  'TND', i.commission_millimes, 3,
  'TND', i.commission_millimes,
  1, 'TND_base_order', coalesce(o.paid_at, o.created_at),
  'verified_payment_backfill', o.payment_confirmation_ref,
  'order_item:' || i.id::text || ':platform_commission'
FROM public.orders o
JOIN public.order_items i ON i.order_id = o.id
WHERE o.status = 'paid' AND o.payment_mode = 'verified'
  AND coalesce(i.commission_millimes, 0) > 0
ON CONFLICT (idempotency_key) DO NOTHING;

INSERT INTO public.platform_financial_ledger_entries (
  entry_type, entry_side, order_id, order_item_id, seller_id, store_id,
  transaction_currency, transaction_amount_minor, transaction_currency_exponent,
  accounting_currency, accounting_amount_millimes,
  fx_rate, fx_rate_source, fx_rate_at,
  source, external_reference, idempotency_key
)
SELECT
  'seller_payable', 'credit', o.id, i.id, i.seller_id, i.store_id,
  'TND', i.seller_net_millimes, 3,
  'TND', i.seller_net_millimes,
  1, 'TND_base_order', coalesce(o.paid_at, o.created_at),
  'verified_payment_backfill', o.payment_confirmation_ref,
  'order_item:' || i.id::text || ':seller_payable'
FROM public.orders o
JOIN public.order_items i ON i.order_id = o.id
WHERE o.status = 'paid' AND o.payment_mode = 'verified'
  AND coalesce(i.seller_net_millimes, 0) > 0
ON CONFLICT (idempotency_key) DO NOTHING;


-- Record the platform's own completed weekly/manual seller transfer in the
-- same ledger. This function only records a transfer already made externally;
-- it never calls a bank, wallet, or payment provider.
CREATE OR REPLACE FUNCTION public.admin_mark_seller_payout_paid(
  _payout_id uuid,
  _transfer_reference text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _p record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _transfer_reference IS NULL
     OR length(trim(_transfer_reference)) NOT BETWEEN 3 AND 200 THEN
    RAISE EXCEPTION 'transfer_reference_required';
  END IF;

  SELECT po.*, s.owner_id AS seller_id
    INTO _p
  FROM public.seller_payouts po
  JOIN public.stores s ON s.id = po.store_id
  WHERE po.id = _payout_id
  FOR UPDATE OF po;
  IF NOT FOUND THEN RAISE EXCEPTION 'payout_not_found'; END IF;
  IF _p.method <> 'weekly_manual' OR _p.provider <> 'manual' THEN
    RAISE EXCEPTION 'unsupported_payout_method';
  END IF;
  IF _p.currency <> 'TND' THEN
    RAISE EXCEPTION 'phase_one_payout_currency_must_be_tnd';
  END IF;
  IF _p.status = 'paid' THEN
    IF _p.provider_transfer_ref = trim(_transfer_reference) THEN
      RETURN true;
    END IF;
    RAISE EXCEPTION 'payout_already_paid';
  END IF;
  IF _p.status NOT IN ('pending','processing','failed') THEN
    RAISE EXCEPTION 'payout_not_payable';
  END IF;
  IF _p.seller_amount_millimes <= 0 THEN
    RAISE EXCEPTION 'invalid_seller_payout_amount';
  END IF;

  UPDATE public.seller_payouts
  SET status = 'paid',
      provider_transfer_ref = trim(_transfer_reference),
      initiated_at = coalesce(initiated_at, now()),
      paid_at = now(),
      failure_reason = NULL
  WHERE id = _payout_id;

  INSERT INTO public.platform_financial_ledger_entries (
    entry_type, entry_side, seller_id, store_id,
    transaction_currency, transaction_amount_minor, transaction_currency_exponent,
    accounting_currency, accounting_amount_millimes,
    fx_rate, fx_rate_source, fx_rate_at,
    source, external_reference, idempotency_key
  ) VALUES (
    'seller_payout', 'debit', _p.seller_id, _p.store_id,
    'TND', _p.seller_amount_millimes, 3,
    'TND', _p.seller_amount_millimes,
    1, 'TND_manual_payout', now(),
    'platform_manual_seller_payout', trim(_transfer_reference),
    'seller_payout:' || _payout_id::text
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_mark_seller_payout_paid(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mark_seller_payout_paid(uuid, text)
  TO authenticated, service_role;

-- Backfill completed TND manual payouts so the internal ledger also reflects
-- historical platform transfers that predate this migration.
INSERT INTO public.platform_financial_ledger_entries (
  entry_type, entry_side, seller_id, store_id,
  transaction_currency, transaction_amount_minor, transaction_currency_exponent,
  accounting_currency, accounting_amount_millimes,
  fx_rate, fx_rate_source, fx_rate_at,
  source, external_reference, idempotency_key
)
SELECT
  'seller_payout', 'debit', s.owner_id, p.store_id,
  'TND', p.seller_amount_millimes, 3,
  'TND', p.seller_amount_millimes,
  1, 'TND_manual_payout', coalesce(p.paid_at, p.created_at),
  'platform_manual_payout_backfill', p.provider_transfer_ref,
  'seller_payout:' || p.id::text
FROM public.seller_payouts p
JOIN public.stores s ON s.id = p.store_id
WHERE p.status = 'paid'
  AND p.method = 'weekly_manual'
  AND p.provider = 'manual'
  AND p.currency = 'TND'
  AND p.seller_amount_millimes > 0
  AND p.provider_transfer_ref IS NOT NULL
ON CONFLICT (idempotency_key) DO NOTHING;

