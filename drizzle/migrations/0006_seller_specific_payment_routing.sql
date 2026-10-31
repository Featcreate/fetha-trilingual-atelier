-- Seller-specific payment routing foundation.
-- This migration does NOT activate live payments or configure provider credentials.
-- A seller payment account is created/verified only by trusted server-side onboarding.

CREATE TYPE public.payment_provider AS ENUM ('konnect', 'ipay');
CREATE TYPE public.seller_payment_account_status AS ENUM
  ('not_started', 'pending', 'verified', 'rejected', 'suspended');

CREATE TABLE public.seller_payment_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE RESTRICT,
  seller_id uuid NOT NULL,
  seller_country_code text NOT NULL CHECK (seller_country_code ~ '^[A-Z]{2}$'),
  provider public.payment_provider NOT NULL,
  provider_account_ref text,
  referral_code_used text,
  status public.seller_payment_account_status NOT NULL DEFAULT 'not_started',
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_provider_by_country CHECK (
    (seller_country_code = 'TN' AND provider = 'konnect')
    OR (seller_country_code <> 'TN' AND provider = 'ipay')
  ),
  CONSTRAINT seller_verified_account_has_reference CHECK (
    status <> 'verified' OR (provider_account_ref IS NOT NULL AND length(trim(provider_account_ref)) > 0)
  ),
  CONSTRAINT referral_only_for_tunisia CHECK (
    referral_code_used IS NULL OR (seller_country_code = 'TN' AND provider = 'konnect')
  )
);

CREATE INDEX seller_payment_accounts_seller_idx ON public.seller_payment_accounts(seller_id);
CREATE INDEX seller_payment_accounts_provider_status_idx
  ON public.seller_payment_accounts(provider, status);

ALTER TABLE public.seller_payment_accounts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.seller_payment_accounts TO authenticated;
GRANT ALL ON public.seller_payment_accounts TO service_role;

CREATE POLICY "Sellers read own payment account"
  ON public.seller_payment_accounts FOR SELECT TO authenticated
  USING (seller_id = auth.uid());
CREATE POLICY "Admins read seller payment accounts"
  ON public.seller_payment_accounts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- No client-side INSERT/UPDATE/DELETE: onboarding and verification are trusted server actions only.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.seller_payment_accounts FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.seller_payment_account_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'seller_payment_account_immutable'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.store_id <> OLD.store_id OR NEW.seller_id <> OLD.seller_id THEN
      RAISE EXCEPTION 'seller_payment_identity_immutable';
    END IF;
    IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'seller_payment_account_server_only';
    END IF;
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER seller_payment_account_guard
  BEFORE UPDATE OR DELETE ON public.seller_payment_accounts
  FOR EACH ROW EXECUTE FUNCTION public.seller_payment_account_guard();

-- Provider-neutral order snapshot. Legacy Konnect columns remain for compatibility.
ALTER TABLE public.orders
  ADD COLUMN payment_provider public.payment_provider,
  ADD COLUMN provider_payment_ref text,
  ADD COLUMN provider_checkout_url text,
  ADD COLUMN provider_account_ref text;

CREATE UNIQUE INDEX orders_provider_payment_ref_unique
  ON public.orders(payment_provider, provider_payment_ref)
  WHERE provider_payment_ref IS NOT NULL;

ALTER TABLE public.payment_events
  ADD COLUMN payment_provider public.payment_provider,
  ADD COLUMN provider_event_id text,
  ADD COLUMN provider_status text;

CREATE UNIQUE INDEX payment_events_provider_event_unique
  ON public.payment_events(payment_provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

COMMENT ON TABLE public.seller_payment_accounts IS
  'Verified seller-to-provider account mapping. Never store provider API secrets here. '
  'TN sellers use Konnect referral onboarding; non-TN sellers use their own iPay merchant account.';
COMMENT ON COLUMN public.orders.provider_account_ref IS
  'Immutable-at-checkout snapshot of the seller merchant account that should receive this payment.';
COMMENT ON COLUMN public.orders.payment_provider IS
  'Provider selected from the seller account country: Konnect for TN, iPay otherwise. Does not enable live processing.';
