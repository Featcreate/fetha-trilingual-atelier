-- Run after migrations through 0034 on a disposable/test database.
-- Data-free regression checks for independent seller receiving destinations.
DO $$
DECLARE
  _preference_guard text;
  _policy_check text;
  _snapshot_check text;
BEGIN
  SELECT pg_get_functiondef(
    'public.guard_seller_payout_preference()'::regprocedure
  ) INTO _preference_guard;

  IF position('konnect' IN _preference_guard) = 0
     OR position('ipay' IN _preference_guard) = 0
     OR position('wepay' IN _preference_guard) = 0
     OR position('bank_transfer' IN _preference_guard) = 0
     OR position('payout_destination_details_required' IN _preference_guard) = 0 THEN
    RAISE EXCEPTION 'test_failed: seller guard must accept all manual receiving destinations and require destination details';
  END IF;

  SELECT with_check INTO _policy_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'seller_payout_preferences'
    AND policyname = 'Sellers manage own payout preference';

  IF _policy_check IS NULL
     OR position('konnect' IN _policy_check) = 0
     OR position('owner_id' IN _policy_check) = 0 THEN
    RAISE EXCEPTION 'test_failed: seller RLS policy must permit Konnect destination while enforcing store ownership';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO _snapshot_check
  FROM pg_constraint
  WHERE conrelid = 'public.seller_payouts'::regclass
    AND conname = 'seller_payout_destination_snapshot_check';

  IF _snapshot_check IS NULL
     OR position('konnect' IN _snapshot_check) = 0
     OR position('ipay' IN _snapshot_check) = 0
     OR position('wepay' IN _snapshot_check) = 0
     OR position('bank_transfer' IN _snapshot_check) = 0 THEN
    RAISE EXCEPTION 'test_failed: immutable payout destination snapshot must accept every supported manual destination';
  END IF;

  IF position('initiate' IN lower(_preference_guard)) > 0
     OR position('api' IN lower(_preference_guard)) > 0 THEN
    RAISE EXCEPTION 'test_failed: seller preference validation must not invoke a payout provider';
  END IF;
END;
$$;
