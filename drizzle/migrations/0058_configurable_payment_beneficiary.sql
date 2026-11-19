-- Keep the platform brand as the only buyer-visible beneficiary label.
-- The real receiving-account holder is retained in an admin-only column.
ALTER TABLE public.platform_payment_methods
  ADD COLUMN IF NOT EXISTS account_holder_name text NOT NULL DEFAULT '';

ALTER TABLE public.platform_payment_methods
  DROP CONSTRAINT IF EXISTS platform_payment_methods_beneficiary_label_check;

UPDATE public.platform_payment_methods
SET beneficiary_label = 'Algorea Bazaar'
WHERE beneficiary_label IS DISTINCT FROM 'Algorea Bazaar';

ALTER TABLE public.platform_payment_methods
  ALTER COLUMN beneficiary_label SET DEFAULT 'Algorea Bazaar',
  ALTER COLUMN account_holder_name SET DEFAULT '';

ALTER TABLE public.platform_payment_methods
  ADD CONSTRAINT platform_payment_methods_beneficiary_label_check
  CHECK (beneficiary_label = 'Algorea Bazaar');

ALTER TABLE public.platform_payment_methods
  ADD CONSTRAINT platform_payment_methods_account_holder_name_check
  CHECK (
    length(trim(account_holder_name)) BETWEEN 1 AND 120
    OR (enabled = false AND account_holder_name = '')
  );

-- Buyers may read only public payment instructions; account_holder_name is
-- intentionally excluded from column-level SELECT privileges.
REVOKE ALL ON public.platform_payment_methods FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  method, beneficiary_label, account_identifier, instructions, enabled, updated_at
) ON public.platform_payment_methods TO anon, authenticated;
GRANT ALL ON public.platform_payment_methods TO service_role;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_payment_method_snapshot_complete;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_payment_method_snapshot_complete CHECK (
    (payment_method IS NULL
      AND payment_beneficiary_snapshot IS NULL
      AND payment_account_identifier_snapshot IS NULL
      AND payment_instructions_snapshot IS NULL)
    OR (payment_method IS NOT NULL
      AND payment_beneficiary_snapshot = 'Algorea Bazaar'
      AND length(trim(coalesce(payment_account_identifier_snapshot, ''))) > 0
      AND payment_instructions_snapshot IS NOT NULL)
  );

DROP FUNCTION IF EXISTS public.server_admin_upsert_platform_payment_method(
  uuid, text, text, text, boolean
);
REVOKE ALL ON FUNCTION public.admin_upsert_platform_payment_method(text,text,text,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION IF EXISTS public.admin_upsert_platform_payment_method(text,text,text,boolean);

CREATE OR REPLACE FUNCTION public.admin_upsert_platform_payment_method(
  _method text,
  _account_holder_name text,
  _account_identifier text,
  _instructions text,
  _enabled boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _method NOT IN ('flouci', 'bank_transfer', 'postal_transfer')
     OR _account_holder_name IS NULL
     OR length(trim(_account_holder_name)) NOT BETWEEN 1 AND 120
     OR _account_identifier IS NULL OR length(trim(_account_identifier)) > 200
     OR _instructions IS NULL OR length(trim(_instructions)) > 1000
     OR (_enabled = true AND length(trim(_account_identifier)) = 0) THEN
    RAISE EXCEPTION 'invalid_payment_method_configuration';
  END IF;

  INSERT INTO public.platform_payment_methods(
    method, beneficiary_label, account_holder_name, account_identifier,
    instructions, enabled, updated_at, updated_by
  ) VALUES (
    _method, 'Algorea Bazaar', trim(_account_holder_name),
    trim(_account_identifier), trim(_instructions), _enabled, now(), auth.uid()
  )
  ON CONFLICT (method) DO UPDATE SET
    beneficiary_label = 'Algorea Bazaar',
    account_holder_name = EXCLUDED.account_holder_name,
    account_identifier = EXCLUDED.account_identifier,
    instructions = EXCLUDED.instructions,
    enabled = EXCLUDED.enabled,
    updated_at = now(),
    updated_by = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION public.set_order_platform_payment_method(
  _order_id uuid, _method text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _order public.orders%ROWTYPE;
  _method_row public.platform_payment_methods%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF _method NOT IN ('flouci', 'bank_transfer', 'postal_transfer') THEN
    RAISE EXCEPTION 'invalid_payment_method';
  END IF;
  SELECT * INTO _order FROM public.orders WHERE id = _order_id FOR UPDATE;
  IF NOT FOUND OR _order.user_id <> auth.uid() THEN RAISE EXCEPTION 'order_not_found'; END IF;
  IF _order.status <> 'pending' THEN RAISE EXCEPTION 'order_closed'; END IF;
  IF _order.ipay_payment_ref IS NOT NULL OR _order.konnect_payment_ref IS NOT NULL THEN
    RAISE EXCEPTION 'order_has_provider_payment';
  END IF;
  IF _order.payment_method IS NOT NULL THEN
    IF _order.payment_method = _method THEN RETURN true; END IF;
    RAISE EXCEPTION 'payment_method_already_selected';
  END IF;
  SELECT * INTO _method_row FROM public.platform_payment_methods
  WHERE method = _method AND enabled = true;
  IF NOT FOUND OR length(trim(_method_row.account_identifier)) = 0 THEN
    RAISE EXCEPTION 'payment_method_unavailable';
  END IF;
  UPDATE public.orders
  SET payment_method = _method,
      payment_beneficiary_snapshot = 'Algorea Bazaar',
      payment_account_identifier_snapshot = _method_row.account_identifier,
      payment_instructions_snapshot = _method_row.instructions
  WHERE id = _order_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.server_admin_upsert_platform_payment_method(
  _actor_id uuid,
  _method text,
  _account_holder_name text,
  _account_identifier text,
  _instructions text,
  _enabled boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF _actor_id IS NULL OR NOT public.has_role(_actor_id, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', _actor_id, 'role', 'authenticated')::text,
    true
  );
  PERFORM public.admin_upsert_platform_payment_method(
    _method, _account_holder_name, _account_identifier, _instructions, _enabled
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_upsert_platform_payment_method(text, text, text, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_platform_payment_method(text, text, text, text, boolean)
  TO service_role;

REVOKE ALL ON FUNCTION public.server_admin_upsert_platform_payment_method(
  uuid, text, text, text, text, boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.server_admin_upsert_platform_payment_method(
  uuid, text, text, text, text, boolean
) TO service_role;

REVOKE ALL ON FUNCTION public.set_order_platform_payment_method(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_order_platform_payment_method(uuid, text)
  TO service_role;

COMMENT ON COLUMN public.platform_payment_methods.beneficiary_label IS
  'Buyer-visible platform brand; always Algorea Bazaar.';
COMMENT ON COLUMN public.platform_payment_methods.account_holder_name IS
  'Private receiving-account holder name; admin-only and never returned to buyers.';
