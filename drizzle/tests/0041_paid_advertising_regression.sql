-- Regression checks for the paid-advertising foundation (run after migration 0041 in a disposable DB).
DO $$
DECLARE
  _rls boolean;
  _client_insert_privilege boolean;
  _ad_slot_trigger boolean;
  _ledger_ad_trigger boolean;
  _private_ad_bucket boolean;
  _activation_function boolean;
  _package_rls boolean;
  _package_client_write boolean;
BEGIN
  SELECT c.relrowsecurity INTO _rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'paid_advertising_orders';
  IF _rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'paid_advertising_rls_not_enabled';
  END IF;

  SELECT has_table_privilege('authenticated', 'public.paid_advertising_orders', 'INSERT')
    OR has_table_privilege('anon', 'public.paid_advertising_orders', 'INSERT')
    INTO _client_insert_privilege;
  IF _client_insert_privilege THEN
    RAISE EXCEPTION 'paid_advertising_client_insert_must_be_denied';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.paid_advertising_orders'::regclass
      AND tgname = 'paid_advertising_activation_guard'
      AND NOT tgisinternal
  ) INTO _ad_slot_trigger;
  IF NOT _ad_slot_trigger THEN
    RAISE EXCEPTION 'paid_advertising_slot_guard_missing';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.platform_financial_ledger_entries'::regclass
      AND tgname = 'platform_ledger_validate_advertising_insert'
      AND NOT tgisinternal
  ) INTO _ledger_ad_trigger;
  IF NOT _ledger_ad_trigger THEN
    RAISE EXCEPTION 'paid_advertising_ledger_guard_missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.platform_financial_ledger_entries'::regclass
      AND conname = 'platform_ledger_advertising_scope_check'
  ) THEN
    RAISE EXCEPTION 'paid_advertising_ledger_scope_constraint_missing';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'advertising-assets' AND public = false
      AND file_size_limit = 10485760
  ) INTO _private_ad_bucket;
  IF NOT _private_ad_bucket THEN
    RAISE EXCEPTION 'paid_advertising_bucket_must_be_private';
  END IF;

  SELECT to_regprocedure('public.admin_activate_paid_advertising_order(uuid)') IS NOT NULL
    INTO _activation_function;
  IF NOT _activation_function THEN
    RAISE EXCEPTION 'paid_advertising_activation_function_missing';
  END IF;

  SELECT c.relrowsecurity INTO _package_rls
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'paid_advertising_packages';
  IF _package_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'paid_advertising_packages_rls_not_enabled';
  END IF;

  SELECT has_table_privilege('authenticated', 'public.paid_advertising_packages', 'INSERT')
    OR has_table_privilege('authenticated', 'public.paid_advertising_packages', 'UPDATE')
    INTO _package_client_write;
  IF _package_client_write THEN
    RAISE EXCEPTION 'paid_advertising_package_client_write_must_be_denied';
  END IF;

  IF (SELECT count(*) FROM public.paid_advertising_packages WHERE is_active) <> 3 THEN
    RAISE EXCEPTION 'paid_advertising_default_packages_missing';
  END IF;

  IF to_regprocedure('public.admin_set_paid_advertising_package(smallint,bigint)') IS NULL THEN
    RAISE EXCEPTION 'paid_advertising_package_admin_function_missing';
  END IF;
END;
$$;
