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
