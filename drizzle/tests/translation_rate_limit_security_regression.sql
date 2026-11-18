-- Read-only regression assertions for the translation rate-limit boundary.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'translation_rate_limits'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'translation_rate_limits_rls_missing';
  END IF;

  IF has_table_privilege('anon', 'public.translation_rate_limits', 'SELECT')
     OR has_table_privilege('authenticated', 'public.translation_rate_limits', 'SELECT') THEN
    RAISE EXCEPTION 'translation_rate_limits_exposed_to_clients';
  END IF;

  IF has_function_privilege('anon', 'public.consume_translation_rate_limit(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.consume_translation_rate_limit(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'translation_rate_limit_rpc_exposed_to_clients';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.consume_translation_rate_limit(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'translation_rate_limit_service_role_missing';
  END IF;
END;
$$;
