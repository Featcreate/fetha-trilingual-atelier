-- Read-only regression checks for the current payout accounting and destination policy.
DO $$
DECLARE
  _payout_check text;
  _destination_check text;
  _payout_function text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO _payout_check
  FROM pg_constraint
  WHERE conrelid = 'public.seller_payouts'::regclass
    AND conname = 'seller_payouts_reconcile';

  IF _payout_check IS NULL
     OR position('external_fees_millimes' IN _payout_check) = 0 THEN
    RAISE EXCEPTION 'test_failed: payout reconciliation must include evidenced external fees';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO _destination_check
  FROM pg_constraint
  WHERE conrelid = 'public.seller_payout_preferences'::regclass
    AND conname = 'seller_payout_preferences_method_check';

  IF _destination_check IS NULL
     OR position('bank_transfer' IN _destination_check) = 0
     OR position('konnect' IN _destination_check) > 0
     OR position('ipay' IN _destination_check) > 0
     OR position('wepay' IN _destination_check) > 0 THEN
    RAISE EXCEPTION 'test_failed: bank transfer must be the only enabled seller destination';
  END IF;

  SELECT pg_get_functiondef(
    'public.admin_create_seller_payout(uuid,text,timestamptz)'::regprocedure
  ) INTO _payout_function;

  IF position('seller_external_fee_entries' IN _payout_function) = 0
     OR position('seller_payout_fee_allocations' IN _payout_function) = 0
     OR position('_seller_amount := _seller_gross - _external_fees' IN _payout_function) = 0
     OR position('IF _seller_amount < 50000 THEN' IN _payout_function) = 0 THEN
    RAISE EXCEPTION 'test_failed: payout function must deduct evidenced fees and enforce the 50 TND net minimum';
  END IF;
END;
$$;
