-- Admin-controlled iPay checkout kill switch.
-- The environment flag remains a second independent fail-closed gate.
ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS ipay_checkout_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.platform_settings.ipay_checkout_enabled IS
  'Admin-controlled iPay checkout switch. Defaults off; server environment gate must also be enabled.';

CREATE OR REPLACE FUNCTION public.admin_set_ipay_checkout_enabled(_enabled boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.platform_settings
     SET ipay_checkout_enabled = _enabled,
         updated_by = auth.uid(),
         updated_at = now()
   WHERE id = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'platform_settings_not_found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_ipay_checkout_enabled(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_ipay_checkout_enabled(boolean) TO authenticated, service_role;
