-- Run after applying migrations through 0030 on a disposable/test database.
-- Data-free checks for seller-selected destinations and weekly manual payout snapshots.
DO $$
DECLARE
  _method_type text;
  _create_payout_function text;
  _payout_guard text;
  _preference_guard text;
  _policy_qual text;
  _policy_check text;
BEGIN
  SELECT data_type INTO _method_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'seller_payout_preferences'
    AND column_name = 'method';

  IF _method_type IS DISTINCT FROM 'text' THEN
    RAISE EXCEPTION 'test_failed: seller payout preference method must be a destination text field';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'seller_payout_preferences'
      AND column_name = 'account_identifier'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'seller_payout_preferences'
      AND column_name = 'account_holder_name'
  ) THEN
    RAISE EXCEPTION 'test_failed: seller receiving details columns are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'seller_payouts'
      AND column_name = 'payout_destination_method'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'seller_payouts'
      AND column_name = 'payout_account_identifier'
  ) THEN
    RAISE EXCEPTION 'test_failed: immutable payout destination snapshot columns are missing';
  END IF;

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.seller_payout_preferences'::regclass) THEN
    RAISE EXCEPTION 'test_failed: seller payout preferences must retain RLS';
  END IF;

  SELECT qual, with_check INTO _policy_qual, _policy_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'seller_payout_preferences'
    AND policyname = 'Sellers manage own payout preference';

  IF _policy_qual IS NULL OR _policy_check IS NULL
     OR position('owner_id' IN _policy_qual) = 0
     OR position('owner_id' IN _policy_check) = 0
     OR position('weekly_manual' IN _policy_check) > 0 THEN
    RAISE EXCEPTION 'test_failed: seller destination policy must enforce ownership without forcing weekly_manual as a destination';
  END IF;

  SELECT pg_get_functiondef(
    'public.admin_create_seller_payout(uuid,text,timestamptz)'::regprocedure
  ) INTO _create_payout_function;

  IF position('payout_destination_required' IN _create_payout_function) = 0
     OR position('payout_destination_method' IN _create_payout_function) = 0
     OR position('payout_account_identifier' IN _create_payout_function) = 0
     OR position('seller_external_fee_entries' IN _create_payout_function) = 0
     OR position('seller_payout_fee_allocations' IN _create_payout_function) = 0
     OR position('_seller_amount := _seller_gross - _external_fees' IN _create_payout_function) = 0 THEN
    RAISE EXCEPTION 'test_failed: payout creation must snapshot destination and deduct only outstanding evidenced seller fees';
  END IF;

  IF position('unsupported_payout_method' IN _create_payout_function) > 0 THEN
    RAISE EXCEPTION 'test_failed: payout creation must not confuse receiving destination with weekly manual execution';
  END IF;

  SELECT pg_get_functiondef(
    'public.guard_seller_payout_update()'::regprocedure
  ) INTO _payout_guard;

  IF position('payout_account_identifier' IN _payout_guard) = 0
     OR position('payout_destination_method' IN _payout_guard) = 0
     OR position('payout_financial_snapshot_immutable' IN _payout_guard) = 0 THEN
    RAISE EXCEPTION 'test_failed: payout destination snapshot must be immutable';
  END IF;

  SELECT pg_get_functiondef(
    'public.guard_seller_payout_preference()'::regprocedure
  ) INTO _preference_guard;

  IF position('payout_destination_details_required' IN _preference_guard) = 0
     OR position('ipay' IN _preference_guard) = 0
     OR position('wepay' IN _preference_guard) = 0
     OR position('bank_transfer' IN _preference_guard) = 0
     OR position('other' IN _preference_guard) = 0 THEN
    RAISE EXCEPTION 'test_failed: seller preference validation must accept the four supported receiving methods';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.seller_payout_preferences'::regclass
      AND t.tgname = 'seller_payout_preferences_guard'
      AND NOT t.tgisinternal
      AND t.tgenabled = 'O'
      AND (t.tgtype & 2) = 2 -- BEFORE
      AND (t.tgtype & 4) = 4 -- INSERT
      AND (t.tgtype & 16) = 16 -- UPDATE
      AND t.tgfoid = 'public.guard_seller_payout_preference()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'test_failed: enabled BEFORE INSERT/UPDATE payout preference guard trigger is missing';
  END IF;

  IF NOT (
    SELECT prosecdef
    FROM pg_proc
    WHERE oid = 'public.guard_seller_payout_preference()'::regprocedure
  ) THEN
    RAISE EXCEPTION 'test_failed: payout preference guard must retain its SECURITY DEFINER ownership check';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.guard_seller_payout_preference()'::regprocedure,
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.guard_seller_payout_preference()'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'test_failed: trigger guard must not be directly executable by API roles';
  END IF;
END;
$$;
