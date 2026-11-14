-- Restore the fee-aware payout reconciliation and enforce the current bank-only seller destination.
-- seller_amount_millimes is the net amount after the evidenced seller-transfer fees;
-- gross = discount + platform commission + net seller amount + allocated transfer fees.

ALTER TABLE public.seller_payouts
  DROP CONSTRAINT IF EXISTS seller_payouts_reconcile;

ALTER TABLE public.seller_payouts
  ADD CONSTRAINT seller_payouts_reconcile CHECK (
    gross_millimes = discount_millimes
      + commission_millimes
      + seller_amount_millimes
      + external_fees_millimes
  );

-- Phase 1 supports bank transfer only. Keep the schema extensible for a
-- separately reviewed future migration, but reject other destinations now.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.seller_payout_preferences
    WHERE method <> 'bank_transfer'
  ) THEN
    RAISE EXCEPTION 'non_bank_seller_payout_preferences_exist';
  END IF;
END;
$$;

ALTER TABLE public.seller_payout_preferences
  ALTER COLUMN method SET DEFAULT 'bank_transfer',
  DROP CONSTRAINT IF EXISTS seller_payout_preferences_method_check;

ALTER TABLE public.seller_payout_preferences
  ADD CONSTRAINT seller_payout_preferences_method_check
  CHECK (method = 'bank_transfer');

COMMENT ON CONSTRAINT seller_payouts_reconcile ON public.seller_payouts IS
  'Reconciles gross sales to discounts, platform commission, net seller payout, and separately evidenced seller-transfer fees.';

COMMENT ON CONSTRAINT seller_payout_preferences_method_check ON public.seller_payout_preferences IS
  'Bank transfer is the only seller receiving destination enabled in Phase 1.';
