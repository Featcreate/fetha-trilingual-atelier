-- Trusted server wrappers for identity-bound marketplace RPCs.
-- Each wrapper is service_role-only. The application server passes the user ID
-- obtained from the verified Supabase session; the original function continues
-- to enforce auth.uid(), ownership, email verification, and business invariants.

CREATE OR REPLACE FUNCTION public.server_create_seller_store(
  _actor_id uuid, _name text, _slug text, _privacy_version text, _terms_version text, _language text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF _actor_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor_id, 'role', 'authenticated')::text, true);
  RETURN public.create_seller_store(_name, _slug, _privacy_version, _terms_version, _language);
END;
$$;

CREATE OR REPLACE FUNCTION public.server_register_file_version(
  _actor_id uuid, _product_id uuid, _file_name text, _size_bytes bigint, _mime_type text, _sha256 text
) RETURNS TABLE (version_id uuid, upload_path text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF _actor_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor_id, 'role', 'authenticated')::text, true);
  RETURN QUERY SELECT * FROM public.register_file_version(_product_id, _file_name, _size_bytes, _mime_type, _sha256);
END;
$$;

CREATE OR REPLACE FUNCTION public.server_activate_file_version(_actor_id uuid, _version_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF _actor_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor_id, 'role', 'authenticated')::text, true);
  PERFORM public.activate_file_version(_version_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.server_archive_file_version(_actor_id uuid, _version_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF _actor_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor_id, 'role', 'authenticated')::text, true);
  PERFORM public.archive_file_version(_version_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.server_create_order(_actor_id uuid, _product_ids uuid[], _checkout_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF _actor_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor_id, 'role', 'authenticated')::text, true);
  RETURN public.create_order(_product_ids, _checkout_key);
END;
$function$;

CREATE OR REPLACE FUNCTION public.server_create_order_from_cart(_actor_id uuid, _items jsonb, _checkout_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF _actor_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor_id, 'role', 'authenticated')::text, true);
  RETURN public.create_order_from_cart(_items, _checkout_key);
END;
$$;

CREATE OR REPLACE FUNCTION public.server_claim_order_ipay_init(_actor_id uuid, _order_id uuid)
RETURNS TABLE (outcome text, pay_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF _actor_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor_id, 'role', 'authenticated')::text, true);
  RETURN QUERY SELECT * FROM public.claim_order_ipay_init(_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.server_claim_order_konnect_init(_actor_id uuid, _order_id uuid)
RETURNS TABLE (outcome text, pay_url text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF _actor_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor_id, 'role', 'authenticated')::text, true);
  RETURN QUERY SELECT * FROM public.claim_order_konnect_init(_order_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.server_submit_seller_rating(_actor_id uuid, _store_id uuid, _stars integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF _actor_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor_id, 'role', 'authenticated')::text, true);
  PERFORM public.submit_seller_rating(_store_id, _stars);
END;
$$;

CREATE OR REPLACE FUNCTION public.server_admin_record_seller_external_fee(
  _actor_id uuid, _store_id uuid, _fee_category text, _amount_millimes bigint,
  _source text, _external_reference text, _description text, _idempotency_key text,
  _order_id uuid DEFAULT NULL, _order_item_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF _actor_id IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor_id, 'role', 'authenticated')::text, true);
  IF NOT public.has_role(_actor_id, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN public.admin_record_seller_external_fee(
    _store_id, _fee_category, _amount_millimes, _source, _external_reference,
    _description, _idempotency_key, _order_id, _order_item_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.server_admin_record_shared_seller_fee(
  _actor_id uuid, _order_id uuid, _fee_category text, _amount_millimes bigint,
  _source text, _external_reference text, _description text, _idempotency_key text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF _actor_id IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor_id, 'role', 'authenticated')::text, true);
  IF NOT public.has_role(_actor_id, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN public.admin_record_shared_seller_fee(
    _order_id, _fee_category, _amount_millimes, _source, _external_reference,
    _description, _idempotency_key
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.server_admin_renew_entitlement(
  _actor_id uuid, _entitlement_id uuid, _extra_days integer, _extra_downloads integer, _reason text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
BEGIN
  IF _actor_id IS NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM set_config('request.jwt.claim.sub', _actor_id::text, true);
  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', _actor_id, 'role', 'authenticated')::text, true);
  IF NOT public.has_role(_actor_id, 'admin') THEN RAISE EXCEPTION 'forbidden'; END IF;
  PERFORM public.admin_renew_entitlement(_entitlement_id, _extra_days, _extra_downloads, _reason);
END;
$function$;

REVOKE ALL ON FUNCTION public.server_admin_record_seller_external_fee(uuid,uuid,text,bigint,text,text,text,text,uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.server_admin_record_shared_seller_fee(uuid,uuid,text,bigint,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.server_admin_renew_entitlement(uuid,uuid,integer,integer,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.server_create_seller_store(uuid,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.server_register_file_version(uuid,uuid,text,bigint,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.server_activate_file_version(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.server_archive_file_version(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.server_create_order(uuid,uuid[],text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.server_create_order_from_cart(uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.server_claim_order_ipay_init(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.server_claim_order_konnect_init(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.server_submit_seller_rating(uuid,uuid,integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.server_admin_record_seller_external_fee(uuid,uuid,text,bigint,text,text,text,text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_admin_record_shared_seller_fee(uuid,uuid,text,bigint,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_admin_renew_entitlement(uuid,uuid,integer,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_record_seller_external_fee(uuid,text,bigint,text,text,text,text,uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_record_shared_seller_fee(uuid,text,bigint,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_create_seller_store(uuid,text,text,text,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_register_file_version(uuid,uuid,text,bigint,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_activate_file_version(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_archive_file_version(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_create_order(uuid,uuid[],text) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_create_order_from_cart(uuid,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_claim_order_ipay_init(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_claim_order_konnect_init(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.server_submit_seller_rating(uuid,uuid,integer) TO service_role;

-- This read-only function is fully covered by the seller_ratings own-row RLS
-- policy, so it no longer needs SECURITY DEFINER.
ALTER FUNCTION public.get_my_seller_ratings() SECURITY INVOKER;
