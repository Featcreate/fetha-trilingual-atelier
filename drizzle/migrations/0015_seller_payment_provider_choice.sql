-- Store each Tunisian seller's preferred account-onboarding provider.
-- This is a seller preference only; it does not configure checkout or initiate transfers.
ALTER TABLE public.seller_payout_preferences
  ADD COLUMN IF NOT EXISTS preferred_provider text NOT NULL DEFAULT 'konnect';

ALTER TABLE public.seller_payout_preferences
  DROP CONSTRAINT IF EXISTS seller_payout_preferences_preferred_provider_check;

ALTER TABLE public.seller_payout_preferences
  ADD CONSTRAINT seller_payout_preferences_preferred_provider_check
  CHECK (preferred_provider IN ('konnect', 'ipay'));

COMMENT ON COLUMN public.seller_payout_preferences.preferred_provider IS
  'Seller-selected provider for account onboarding (Konnect or iPay); not a live payment or payout route.';
