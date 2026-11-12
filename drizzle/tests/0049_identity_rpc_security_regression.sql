-- Privilege and SECURITY INVOKER regression assertions for the RPC hardening.
DO $$
DECLARE
  _fn text;
  _legacy text[] := ARRAY[
    'public.create_seller_store(text,text,text,text,text)',
    'public.register_file_version(uuid,text,bigint,text,text)',
    'public.activate_file_version(uuid)',
    'public.archive_file_version(uuid)',
    'public.create_order(uuid[],text)',
    'public.create_order_from_cart(jsonb,text)',
    'public.claim_order_ipay_init(uuid)',
    'public.claim_order_konnect_init(uuid)',
    'public.submit_seller_rating(uuid,integer)',
    'public.admin_record_seller_external_fee(uuid,text,bigint,text,text,text,text,uuid,uuid)',
    'public.admin_record_shared_seller_fee(uuid,text,bigint,text,text,text,text)',
    'public.admin_renew_entitlement(uuid,integer,integer,text)'
  ];
  _wrappers text[] := ARRAY[
    'public.server_create_seller_store(uuid,text,text,text,text,text)',
    'public.server_register_file_version(uuid,uuid,text,bigint,text,text)',
    'public.server_activate_file_version(uuid,uuid)',
    'public.server_archive_file_version(uuid,uuid)',
    'public.server_create_order(uuid,uuid[],text)',
    'public.server_create_order_from_cart(uuid,jsonb,text)',
    'public.server_claim_order_ipay_init(uuid,uuid)',
    'public.server_claim_order_konnect_init(uuid,uuid)',
    'public.server_submit_seller_rating(uuid,uuid,integer)'
  ];
BEGIN
  FOREACH _fn IN ARRAY _legacy LOOP
    IF has_function_privilege('anon', _fn, 'EXECUTE')
       OR has_function_privilege('authenticated', _fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'client_role_can_execute_legacy_rpc:%', _fn;
    END IF;
  END LOOP;

  FOREACH _fn IN ARRAY _wrappers LOOP
    IF NOT has_function_privilege('service_role', _fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role_missing_wrapper_execute:%', _fn;
    END IF;
    IF has_function_privilege('anon', _fn, 'EXECUTE')
       OR has_function_privilege('authenticated', _fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'untrusted_role_can_execute_wrapper:%', _fn;
    END IF;
  END LOOP;

  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.get_my_seller_ratings()'::regprocedure) THEN
    RAISE EXCEPTION 'get_my_seller_ratings_must_be_invoker';
  END IF;
  IF NOT has_function_privilege('anon', 'public.get_top_rated_stores()', 'EXECUTE') THEN
    RAISE EXCEPTION 'public_top_rated_stores_access_missing';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.current_user_sells_order(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'seller_order_rls_helper_access_missing';
  END IF;
END;
$$;
