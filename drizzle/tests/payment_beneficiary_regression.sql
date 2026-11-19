-- Regression checks for actual payment beneficiary labels.
DO $$
DECLARE
  _method_constraint text;
  _order_constraint text;
  _admin_function text;
  _selection_function text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO _method_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.platform_payment_methods'::regclass
    AND conname = 'platform_payment_methods_beneficiary_label_check';

  IF _method_constraint IS NULL OR position('Algorea Bazaar' IN _method_constraint) > 0 THEN
    RAISE EXCEPTION 'payment_beneficiary_must_not_be_hard_coded';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO _order_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.orders'::regclass
    AND conname = 'orders_payment_method_snapshot_complete';

  IF _order_constraint IS NULL OR position('Algorea Bazaar' IN _order_constraint) > 0 THEN
    RAISE EXCEPTION 'order_beneficiary_snapshot_must_accept_actual_holder';
  END IF;

  SELECT pg_get_functiondef(
    'public.admin_upsert_platform_payment_method(text,text,text,text,boolean)'::regprocedure
  ) INTO _admin_function;
  IF position('_beneficiary_label' IN _admin_function) = 0 THEN
    RAISE EXCEPTION 'admin_payment_method_rpc_missing_beneficiary_label';
  END IF;

  SELECT pg_get_functiondef(
    'public.set_order_platform_payment_method(uuid,text)'::regprocedure
  ) INTO _selection_function;
  IF position('_method_row.beneficiary_label' IN _selection_function) = 0 THEN
    RAISE EXCEPTION 'order_snapshot_not_using_actual_beneficiary';
  END IF;
END;
$$;
