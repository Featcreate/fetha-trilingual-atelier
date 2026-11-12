-- Move privileged admin RPC invocation behind trusted server-side handlers.
-- The server verifies the signed-in user's admin role, then calls these wrappers
-- with the service-role client. Each wrapper independently checks the actor role
-- and restores the actor claim only for the legacy function's existing auth.uid()
-- checks. Direct authenticated execution is revoked in the follow-up migration
-- after the application has been deployed with the new server handlers.

CREATE OR REPLACE FUNCTION public.server_admin_create_seller_payout(
  _actor_id uuid, _store_id uuid, _idempotency_key text, _scheduled_for timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF _actor_id IS NULL OR NOT public.has_role(_actor_id, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor_id, 'role', 'authenticated')::text, true);
  RETURN public.admin_create_seller_payout(_store_id, _idempotency_key, _scheduled_for);
END;
$$;

CREATE OR REPLACE FUNCTION public.server_admin_mark_seller_payout_paid(
  _actor_id uuid, _payout_id uuid, _transfer_reference text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF _actor_id IS NULL OR NOT public.has_role(_actor_id, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor_id, 'role', 'authenticated')::text, true);
  RETURN public.admin_mark_seller_payout_paid(_payout_id, _transfer_reference);
END;
$$;

CREATE OR REPLACE FUNCTION public.server_admin_mark_seller_payout_failed(
  _actor_id uuid, _payout_id uuid, _failure_reason text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF _actor_id IS NULL OR NOT public.has_role(_actor_id, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor_id, 'role', 'authenticated')::text, true);
  RETURN public.admin_mark_seller_payout_failed(_payout_id, _failure_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.server_admin_set_commission_bps(
  _actor_id uuid, _bps integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF _actor_id IS NULL OR NOT public.has_role(_actor_id, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor_id, 'role', 'authenticated')::text, true);
  PERFORM public.admin_set_commission_bps(_bps);
END;
$$;

CREATE OR REPLACE FUNCTION public.server_admin_set_ipay_checkout_enabled(
  _actor_id uuid, _enabled boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF _actor_id IS NULL OR NOT public.has_role(_actor_id, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor_id, 'role', 'authenticated')::text, true);
  PERFORM public.admin_set_ipay_checkout_enabled(_enabled);
END;
$$;

REVOKE ALL ON FUNCTION public.server_admin_create_seller_payout(uuid,uuid,text,timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.server_admin_mark_seller_payout_paid(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.server_admin_mark_seller_payout_failed(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.server_admin_set_commission_bps(uuid,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.server_admin_set_ipay_checkout_enabled(uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.server_admin_create_seller_payout(uuid,uuid,text,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_admin_mark_seller_payout_paid(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_admin_mark_seller_payout_failed(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_admin_set_commission_bps(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_admin_set_ipay_checkout_enabled(uuid,boolean) TO service_role;
