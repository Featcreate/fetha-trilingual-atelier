-- Run after applying migrations through 0052 on a disposable/test database.
DO $$
DECLARE
  _definition text;
BEGIN
  SELECT pg_get_functiondef('public.admin_create_seller_payout(uuid,text,timestamptz)'::regprocedure)
    INTO _definition;
  IF position('seller_external_fee_entries' IN _definition) = 0
     OR position('seller_payout_fee_allocations' IN _definition) = 0
     OR position('_seller_amount := _seller_gross - _external_fees' IN _definition) = 0
     OR position('IF _seller_amount < 50000 THEN' IN _definition) = 0
     OR position('external_fees_exceed_available_seller_balance' IN _definition) = 0 THEN
    RAISE EXCEPTION 'test_failed: payout must deduct only evidenced fees and enforce a net minimum of 50 TND';
  END IF;
  IF position('100000' IN _definition) > 0 THEN
    RAISE EXCEPTION 'test_failed: obsolete 100 TND payout threshold remains';
  END IF;
END;
$$;
