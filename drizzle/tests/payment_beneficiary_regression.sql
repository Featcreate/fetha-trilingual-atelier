-- Regression checks: buyer sees the platform brand, while the real
-- receiving-account holder remains private to server-side administration.
DO $$
DECLARE
  _method_constraint text;
  _holder_constraint text;
  _order_constraint text;
  _admin_function text;
  _selection_function text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO _method_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.platform_payment_methods'::regclass
    AND conname = 'platform_payment_methods_beneficiary_label_check';
  IF _method_constraint IS NULL OR position('Algorea Bazaar' IN _method_constraint) = 0 THEN
    RAISE EXCEPTION 'buyer_beneficiary_must_be_platform_brand';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO _holder_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.platform_payment_methods'::regclass
    AND conname = 'platform_payment_methods_account_holder_name_check';
  IF _holder_constraint IS NULL THEN
    RAISE EXCEPTION 'private_account_holder_constraint_missing';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO _order_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.orders'::regclass
    AND conname = 'orders_payment_method_snapshot_complete';
  IF _order_constraint IS NULL OR position('Algorea Bazaar' IN _order_constraint) = 0 THEN
    RAISE EXCEPTION 'order_snapshot_must_show_platform_brand';
  END IF;

  SELECT pg_get_functiondef(
    'public.admin_upsert_platform_payment_method(text,text,text,text,boolean)'::regprocedure
  ) INTO _admin_function;
  IF position('_account_holder_name' IN _admin_function) = 0 THEN
    RAISE EXCEPTION 'admin_rpc_missing_private_account_holder';
  END IF;

  SELECT pg_get_functiondef(
    'public.set_order_platform_payment_method(uuid,text)'::regprocedure
  ) INTO _selection_function;
  IF position('payment_beneficiary_snapshot = ''Algorea Bazaar''' IN _selection_function) = 0 THEN
    RAISE EXCEPTION 'order_snapshot_must_use_platform_brand';
  END IF;
  IF position('_method_row.account_holder_name' IN _selection_function) > 0 THEN
    RAISE EXCEPTION 'private_account_holder_must_not_enter_buyer_snapshot';
  END IF;

  IF has_column_privilege('anon', 'public.platform_payment_methods', 'account_holder_name', 'SELECT')
     OR has_column_privilege('authenticated', 'public.platform_payment_methods', 'account_holder_name', 'SELECT')
     OR NOT has_column_privilege('service_role', 'public.platform_payment_methods', 'account_holder_name', 'SELECT') THEN
    RAISE EXCEPTION 'account_holder_name_must_be_server_only';
  END IF;

  IF has_function_privilege('anon', 'public.admin_upsert_platform_payment_method(text,text,text,text,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_upsert_platform_payment_method(text,text,text,text,boolean)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.admin_upsert_platform_payment_method(text,text,text,text,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'admin_payment_method_rpc_must_be_service_role_only';
  END IF;

  IF has_function_privilege('anon', 'public.set_order_platform_payment_method(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.set_order_platform_payment_method(uuid,text)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.set_order_platform_payment_method(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'order_payment_method_rpc_must_be_service_role_only';
  END IF;
END;
$$;
