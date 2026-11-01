-- Configurable payment routing preferences for future provider changes.
-- This stores administrative preferences only. It does not activate checkout,
-- call a provider API, transfer funds, or alter historical financial records.

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS preferred_collection_provider text NOT NULL DEFAULT 'konnect'
    CHECK (preferred_collection_provider IN ('konnect','bank_gateway','ipay','other')),
  ADD COLUMN IF NOT EXISTS preferred_seller_payout_route text NOT NULL DEFAULT 'weekly_manual'
    CHECK (preferred_seller_payout_route IN ('weekly_manual','manual_bank_transfer','manual_provider_transfer','future_automated')),
  ADD COLUMN IF NOT EXISTS preferred_platform_profit_destination text NOT NULL DEFAULT 'owner_choice'
    CHECK (preferred_platform_profit_destination IN ('owner_choice','konnect','ipay','bank_account','other')),
  ADD COLUMN IF NOT EXISTS payment_configuration_status text NOT NULL DEFAULT 'pending_verification'
    CHECK (payment_configuration_status IN ('pending_verification','verified_sandbox','approved_live'));

CREATE TABLE IF NOT EXISTS public.platform_payment_config_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  changed_by uuid NOT NULL,
  previous_configuration jsonb NOT NULL,
  new_configuration jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_payment_config_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_payment_config_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.platform_payment_config_audit TO authenticated;
GRANT ALL ON public.platform_payment_config_audit TO service_role;

DROP POLICY IF EXISTS "Admins read payment configuration audit" ON public.platform_payment_config_audit;
CREATE POLICY "Admins read payment configuration audit"
  ON public.platform_payment_config_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.admin_update_payment_configuration(
  _collection_provider text,
  _seller_payout_route text,
  _profit_destination text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _uid uuid := auth.uid();
  _previous jsonb;
  _next jsonb;
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _collection_provider IS NULL OR _collection_provider NOT IN ('konnect','bank_gateway','ipay','other')
     OR _seller_payout_route IS NULL OR _seller_payout_route NOT IN ('weekly_manual','manual_bank_transfer','manual_provider_transfer','future_automated')
     OR _profit_destination IS NULL OR _profit_destination NOT IN ('owner_choice','konnect','ipay','bank_account','other') THEN
    RAISE EXCEPTION 'invalid_payment_configuration';
  END IF;

  SELECT jsonb_build_object(
    'collection_provider', preferred_collection_provider,
    'seller_payout_route', preferred_seller_payout_route,
    'profit_destination', preferred_platform_profit_destination,
    'status', payment_configuration_status
  ) INTO _previous
  FROM public.platform_settings
  WHERE id = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'platform_settings_not_found';
  END IF;

  UPDATE public.platform_settings
  SET preferred_collection_provider = _collection_provider,
      preferred_seller_payout_route = _seller_payout_route,
      preferred_platform_profit_destination = _profit_destination,
      payment_configuration_status = 'pending_verification',
      updated_at = now(),
      updated_by = _uid
  WHERE id = true;

  SELECT jsonb_build_object(
    'collection_provider', preferred_collection_provider,
    'seller_payout_route', preferred_seller_payout_route,
    'profit_destination', preferred_platform_profit_destination,
    'status', payment_configuration_status
  ) INTO _next
  FROM public.platform_settings
  WHERE id = true;

  INSERT INTO public.platform_payment_config_audit
    (changed_by, previous_configuration, new_configuration)
  VALUES (_uid, _previous, _next);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_payment_configuration(text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_payment_configuration(text,text,text) TO authenticated, service_role;

COMMENT ON COLUMN public.platform_settings.preferred_collection_provider IS
  'Administrative provider preference only; changing it does not switch or activate payment processing.';
COMMENT ON COLUMN public.platform_settings.preferred_seller_payout_route IS
  'Preferred payout operating route; current seller payout execution remains manual until separately verified and implemented.';
COMMENT ON COLUMN public.platform_settings.preferred_platform_profit_destination IS
  'Owner-selected destination preference for platform earnings; no funds are moved by this setting.';
COMMENT ON COLUMN public.platform_settings.payment_configuration_status IS
  'Every preference change returns to pending_verification. Live payment activation remains separately gated.';
