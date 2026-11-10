-- Add an independent, fail-closed iPay initialization claim.
-- A provider timeout is uncertain: do not automatically retry and risk duplicate charges.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ipay_init_claimed_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_order_ipay_init(_order_id uuid)
RETURNS TABLE (outcome text, pay_url text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _order public.orders%ROWTYPE;
  _uid uuid := auth.uid();
  _other_pending uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(_uid::text || ':ipay-init', 0));

  SELECT * INTO _order
    FROM public.orders
   WHERE id = _order_id AND user_id = _uid
   FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text, NULL::text; RETURN; END IF;
  IF _order.status <> 'pending' THEN
    RETURN QUERY SELECT 'order_closed'::text, NULL::text; RETURN;
  END IF;

  IF _order.konnect_payment_ref IS NOT NULL
     OR _order.konnect_pay_url IS NOT NULL
     OR _order.konnect_init_claimed_at IS NOT NULL THEN
    RETURN QUERY SELECT 'provider_conflict'::text, NULL::text; RETURN;
  END IF;

  IF _order.ipay_payment_ref IS NOT NULL AND _order.ipay_payment_url IS NOT NULL THEN
    RETURN QUERY SELECT 'existing'::text, _order.ipay_payment_url; RETURN;
  END IF;
  IF _order.ipay_payment_ref IS NOT NULL OR _order.ipay_init_claimed_at IS NOT NULL
     OR _order.ipay_payment_url IS NOT NULL THEN
    RETURN QUERY SELECT 'in_progress'::text, NULL::text; RETURN;
  END IF;

  SELECT id INTO _other_pending
    FROM public.orders
   WHERE user_id = _uid
     AND id <> _order_id
     AND status = 'pending'
     AND (
       (ipay_init_claimed_at IS NOT NULL AND ipay_payment_url IS NULL)
       OR (konnect_init_claimed_at IS NOT NULL AND konnect_pay_url IS NULL)
     )
   LIMIT 1;
  IF _other_pending IS NOT NULL THEN
    RETURN QUERY SELECT 'in_progress'::text, NULL::text; RETURN;
  END IF;

  UPDATE public.orders SET ipay_init_claimed_at = now() WHERE id = _order_id;
  RETURN QUERY SELECT 'claimed'::text, NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_order_ipay_init(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_order_ipay_init(uuid) TO authenticated, service_role;
