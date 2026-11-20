-- Regression checks for the fourth manual collection method.
DO $$
DECLARE
  _orders_check text;
  _methods_check text;
  _admin_fn text;
  _select_fn text;
  _enabled boolean;
  _existing_count integer;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO _orders_check
  FROM pg_constraint WHERE conrelid='public.orders'::regclass AND conname='orders_payment_method_check';
  IF _orders_check IS NULL OR position('izi' IN _orders_check)=0 THEN
    RAISE EXCEPTION 'orders_payment_method_check_missing_izi';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO _methods_check
  FROM pg_constraint WHERE conrelid='public.platform_payment_methods'::regclass
    AND conname='platform_payment_methods_method_check';
  IF _methods_check IS NULL OR position('izi' IN _methods_check)=0 THEN
    RAISE EXCEPTION 'platform_payment_methods_method_check_missing_izi';
  END IF;

  SELECT enabled INTO _enabled FROM public.platform_payment_methods WHERE method='izi';
  IF _enabled IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'izi_must_start_disabled';
  END IF;

  SELECT count(*) INTO _existing_count FROM public.platform_payment_methods
  WHERE method IN ('flouci','bank_transfer','postal_transfer');
  IF _existing_count <> 3 THEN RAISE EXCEPTION 'existing_payment_methods_missing'; END IF;

  SELECT pg_get_functiondef('public.admin_upsert_platform_payment_method(text,text,text,text,boolean)'::regprocedure)
    INTO _admin_fn;
  IF position('''izi''' IN _admin_fn)=0 THEN RAISE EXCEPTION 'admin_upsert_does_not_allow_izi'; END IF;

  SELECT pg_get_functiondef('public.set_order_platform_payment_method(uuid,text)'::regprocedure)
    INTO _select_fn;
  IF position('''izi''' IN _select_fn)=0 THEN RAISE EXCEPTION 'order_selection_does_not_allow_izi'; END IF;

  IF has_function_privilege('anon','public.admin_upsert_platform_payment_method(text,text,text,text,boolean)','EXECUTE')
     OR has_function_privilege('authenticated','public.admin_upsert_platform_payment_method(text,text,text,text,boolean)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.admin_upsert_platform_payment_method(text,text,text,text,boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'admin_rpc_permissions_changed';
  END IF;
END;
$$;
