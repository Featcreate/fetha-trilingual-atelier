-- Regression assertions for executable-extension upload blocking.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'product_file_versions'
      AND t.tgname = 'reject_executable_product_file_version'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'executable_file_guard_trigger_missing';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.reject_executable_product_file_version()',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'executable_file_guard_function_missing';
  END IF;
END;
$$;
