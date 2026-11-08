-- Add Konnect as a seller-selected receiving destination.
-- External receiving/withdrawal fees remain outside platform accounting and are
-- never deducted from seller payouts. The weekly payout function from 0031 keeps
-- external_fees_millimes at zero for all new payout records.

ALTER TABLE public.seller_payout_preferences
  DROP CONSTRAINT IF EXISTS seller_payout_preferences_method_check;
ALTER TABLE public.seller_payout_preferences
  ADD CONSTRAINT seller_payout_preferences_method_check
  CHECK (method IN ('konnect', 'ipay', 'wepay', 'bank_transfer', 'other'));

ALTER TABLE public.seller_payouts
  DROP CONSTRAINT IF EXISTS seller_payout_destination_snapshot_check;
ALTER TABLE public.seller_payouts
  ADD CONSTRAINT seller_payout_destination_snapshot_check CHECK (
    (payout_destination_method IS NULL
      AND payout_account_holder_name IS NULL
      AND payout_provider_name IS NULL
      AND payout_account_identifier IS NULL
      AND payout_bank_name IS NULL
      AND payout_additional_details IS NULL)
    OR
    (payout_destination_method IN ('konnect', 'ipay', 'wepay', 'bank_transfer', 'other')
      AND payout_account_holder_name IS NOT NULL
      AND payout_account_identifier IS NOT NULL)
  );

DROP POLICY IF EXISTS "Sellers manage own payout preference"
  ON public.seller_payout_preferences;
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
    method IN ('konnect', 'ipay', 'wepay', 'bank_transfer', 'other')
    AND EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = seller_payout_preferences.store_id
        AND s.owner_id = (SELECT auth.uid())
        AND s.status = 'active'
    )
  );

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

  IF NEW.method NOT IN ('konnect', 'ipay', 'wepay', 'bank_transfer', 'other') THEN
    RAISE EXCEPTION 'unsupported_payout_destination';
  END IF;
  IF NEW.account_holder_name IS NULL
     OR length(trim(NEW.account_holder_name)) NOT BETWEEN 2 AND 160
     OR NEW.account_identifier IS NULL
     OR length(trim(NEW.account_identifier)) NOT BETWEEN 3 AND 200 THEN
    RAISE EXCEPTION 'payout_destination_details_required';
  END IF;
  IF NEW.method = 'other'
     AND (NEW.provider_name IS NULL OR length(trim(NEW.provider_name)) NOT BETWEEN 2 AND 120) THEN
    RAISE EXCEPTION 'payout_provider_name_required';
  END IF;
  IF NEW.method = 'bank_transfer'
     AND (NEW.bank_name IS NULL OR length(trim(NEW.bank_name)) NOT BETWEEN 2 AND 160) THEN
    RAISE EXCEPTION 'payout_bank_name_required';
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

COMMENT ON COLUMN public.seller_payout_preferences.method IS
  'Seller-selected receiving destination: Konnect, iPay, WePay, bank transfer, or another supported method. Weekly manual is the platform settlement cadence, not a destination.';
COMMENT ON COLUMN public.seller_payouts.external_fees_millimes IS
  'Legacy compatibility field. New payouts always store zero; external receiving or withdrawal fees are not recorded, allocated, or deducted by Algorea Bazaar.';
