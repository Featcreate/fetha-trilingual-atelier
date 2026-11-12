-- Catalog-level security regression checks for migrations 0046 and 0047.
DO $$
DECLARE
  _fn text;
  _wrappers text[] := ARRAY[
    'public.server_admin_create_seller_payout(uuid,uuid,text,timestamp with time zone)',
    'public.server_admin_mark_seller_payout_paid(uuid,uuid,text)',
    'public.server_admin_mark_seller_payout_failed(uuid,uuid,text)',
    'public.server_admin_set_commission_bps(uuid,integer)',
    'public.server_admin_set_ipay_checkout_enabled(uuid,boolean)'
  ];
  _legacy text[] := ARRAY[
    'public.admin_create_seller_payout(uuid,text,timestamp with time zone)',
    'public.admin_mark_seller_payout_paid(uuid,text)',
    'public.admin_mark_seller_payout_failed(uuid,text)',
    'public.admin_set_commission_bps(integer)',
    'public.admin_set_ipay_checkout_enabled(boolean)'
  ];
BEGIN
  FOREACH _fn IN ARRAY _wrappers LOOP
    IF NOT has_function_privilege('service_role', _fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role_missing_wrapper_execute:%', _fn;
    END IF;
    IF has_function_privilege('anon', _fn, 'EXECUTE')
       OR has_function_privilege('authenticated', _fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'untrusted_role_can_execute_wrapper:%', _fn;
    END IF;
  END LOOP;

  FOREACH _fn IN ARRAY _legacy LOOP
    IF has_function_privilege('authenticated', _fn, 'EXECUTE')
       OR has_function_privilege('anon', _fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'client_role_can_execute_legacy_admin_rpc:%', _fn;
    END IF;
    IF NOT has_function_privilege('service_role', _fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role_missing_legacy_execute:%', _fn;
    END IF;
  END LOOP;
END;
$$;
