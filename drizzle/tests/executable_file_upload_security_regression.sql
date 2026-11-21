-- Regression assertions for the content-based ClamAV publication gate.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'product_file_versions'
      AND t.tgname = 'reject_executable_product_file_version'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'extension_only_executable_block_must_be_removed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'product_file_versions'
      AND column_name = 'scan_status'
      AND column_default LIKE '%pending%'
  ) THEN
    RAISE EXCEPTION 'file_scan_status_pending_default_missing';
  END IF;

  IF NOT has_function_privilege(
    'service_role', 'public.claim_next_product_file_scan()', 'EXECUTE'
  ) OR has_function_privilege(
    'anon', 'public.claim_next_product_file_scan()', 'EXECUTE'
  ) OR has_function_privilege(
    'authenticated', 'public.claim_next_product_file_scan()', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'scan_claim_rpc_privileges_invalid';
  END IF;

  IF NOT has_function_privilege(
    'service_role', 'public.complete_product_file_scan(uuid,text,text,text)', 'EXECUTE'
  ) OR has_function_privilege(
    'anon', 'public.complete_product_file_scan(uuid,text,text,text)', 'EXECUTE'
  ) OR has_function_privilege(
    'authenticated', 'public.complete_product_file_scan(uuid,text,text,text)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'scan_completion_rpc_privileges_invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'order_item_files'
      AND t.tgname = 'order_item_file_scan_guard'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'purchase_file_scan_guard_missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'order_items'
      AND t.tgname = 'order_item_requires_clean_file'
      AND t.tgdeferrable
      AND t.tginitdeferred
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'clean_file_checkout_constraint_missing';
  END IF;

  IF position(
    'scan_status' IN pg_get_functiondef('public.activate_file_version(uuid)'::regprocedure)
  ) = 0 THEN
    RAISE EXCEPTION 'file_activation_scan_gate_missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'products'
      AND policyname = 'Anyone reads listed products'
      AND qual ILIKE '%scan_status%'
  ) THEN
    RAISE EXCEPTION 'public_catalogue_scan_gate_missing';
  END IF;

  IF position(
    'scan_status' IN pg_get_functiondef('public.guard_order_item_file_scan()'::regprocedure)
  ) = 0 THEN
    RAISE EXCEPTION 'purchase_snapshot_scan_gate_missing';
  END IF;
END;
$;
