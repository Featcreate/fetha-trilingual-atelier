-- Run after applying migrations through 0038 on a disposable/test database.
-- Verify Konnect is accepted and external receiving fees never reduce seller payouts.
DO $$
DECLARE
  _method_check text;
  _snapshot_check text;
  _preference_guard text;
  _create_payout_function text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO _method_check
  FROM pg_constraint
  WHERE conrelid = 'public.seller_payout_preferences'::regclass
    AND conname = 'seller_payout_preferences_method_check';
  IF _method_check IS NULL OR position('konnect' IN lower(_method_check)) = 0 THEN
    RAISE EXCEPTION 'test_failed: Konnect must be an accepted seller receiving method';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO _snapshot_check
  FROM pg_constraint
  WHERE conrelid = 'public.seller_payouts'::regclass
    AND conname = 'seller_payout_destination_snapshot_check';
  IF _snapshot_check IS NULL OR position('konnect' IN lower(_snapshot_check)) = 0 THEN
    RAISE EXCEPTION 'test_failed: payout destination snapshots must accept Konnect';
  END IF;

  SELECT with_check INTO _policy_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'seller_payout_preferences'
    AND policyname = 'Sellers manage own payout preference';
  IF _policy_check IS NULL OR position('konnect' IN lower(_policy_check)) = 0 THEN
    RAISE EXCEPTION 'test_failed: seller RLS policy must allow the Konnect receiving destination';
  END IF;

  SELECT pg_get_functiondef('public.guard_seller_payout_preference()'::regprocedure)
  INTO _preference_guard;
  IF position('konnect' IN lower(_preference_guard)) = 0
     OR position('payout_destination_details_required' IN _preference_guard) = 0
     OR position('payout_provider_name_required' IN _preference_guard) = 0
     OR position('payout_bank_name_required' IN _preference_guard) = 0 THEN
    RAISE EXCEPTION 'test_failed: preference guard must accept Konnect and retain required destination validation';
  END IF;

  -- Fee policy is asserted by the later 0052 regression test. This migration
  -- test is intentionally limited to the destination behavior introduced in 0038.
END;
$$;
