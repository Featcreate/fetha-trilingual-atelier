-- Add IZI as a fourth manually reconciled platform collection method.
-- It remains disabled until an administrator configures and explicitly enables it.
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check
  CHECK (payment_method IS NULL OR payment_method IN ('flouci', 'bank_transfer', 'postal_transfer', 'izi'));
ALTER TABLE public.platform_payment_methods DROP CONSTRAINT IF EXISTS platform_payment_methods_method_check;
ALTER TABLE public.platform_payment_methods ADD CONSTRAINT platform_payment_methods_method_check
  CHECK (method IN ('flouci', 'bank_transfer', 'postal_transfer', 'izi'));

INSERT INTO public.platform_payment_methods (
  method, beneficiary_label, account_holder_name, account_identifier, instructions, enabled
) VALUES (
  'izi', 'Algorea Bazaar', '', '',
  'Transfert manuel vers le portefeuille IZI de Algorea Bazaar. Confirmation administrative après vérification effective de la réception.',
  false
) ON CONFLICT (method) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admin_upsert_platform_payment_method(
  _method text, _account_holder_name text, _account_identifier text, _instructions text, _enabled boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _method NOT IN ('flouci', 'bank_transfer', 'postal_transfer', 'izi')
     OR _account_holder_name IS NULL OR length(trim(_account_holder_name)) NOT BETWEEN 1 AND 120
     OR _account_identifier IS NULL OR length(trim(_account_identifier)) > 200
     OR _instructions IS NULL OR length(trim(_instructions)) > 1000
     OR (_enabled = true AND length(trim(_account_identifier)) = 0) THEN
    RAISE EXCEPTION 'invalid_payment_method_configuration';
  END IF;
  INSERT INTO public.platform_payment_methods(
    method, beneficiary_label, account_holder_name, account_identifier, instructions, enabled, updated_at, updated_by
  ) VALUES (_method, 'Algorea Bazaar', trim(_account_holder_name), trim(_account_identifier), trim(_instructions), _enabled, now(), auth.uid())
  ON CONFLICT (method) DO UPDATE SET
    beneficiary_label = 'Algorea Bazaar', account_holder_name = EXCLUDED.account_holder_name,
    account_identifier = EXCLUDED.account_identifier, instructions = EXCLUDED.instructions,
    enabled = EXCLUDED.enabled, updated_at = now(), updated_by = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.set_order_platform_payment_method(_order_id uuid, _method text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE _order public.orders%ROWTYPE; _method_row public.platform_payment_methods%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _method NOT IN ('flouci', 'bank_transfer', 'postal_transfer', 'izi') THEN RAISE EXCEPTION 'invalid_payment_method'; END IF;
  SELECT * INTO _order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR _order.user_id <> auth.uid() THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF _order.status <> 'pending' THEN RAISE EXCEPTION 'order_closed'; END IF;
  IF _order.ipay_payment_ref IS NOT NULL OR _order.konnect_payment_ref IS NOT NULL THEN RAISE EXCEPTION 'order_has_provider_payment'; END IF;
  IF _order.payment_method IS NOT NULL THEN
    IF _order.payment_method = _method THEN RETURN true; END IF;
    RAISE EXCEPTION 'payment_method_already_selected';
  END IF;
  SELECT * INTO _method_row FROM public.platform_payment_methods WHERE method = _method AND enabled = true;
  IF NOT FOUND OR length(trim(_method_row.account_identifier)) = 0 THEN RAISE EXCEPTION 'payment_method_unavailable'; END IF;
  UPDATE public.orders SET payment_method = _method, payment_beneficiary_snapshot = 'Algorea Bazaar',
    payment_account_identifier_snapshot = _method_row.account_identifier,
    payment_instructions_snapshot = _method_row.instructions WHERE id = _order_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_platform_payment_method(text,text,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_platform_payment_method(text,text,text,text,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.set_order_platform_payment_method(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_order_platform_payment_method(uuid,text) TO service_role;
COMMENT ON CONSTRAINT platform_payment_methods_method_check ON public.platform_payment_methods IS
  'Supported centralized manual collection methods; IZI is initially disabled pending account configuration and validation.';
