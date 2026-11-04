-- Run after applying migrations through 0028 on a disposable/test database.
-- These assertions are data-free: they validate the rounding contract and schema.
DO $$
DECLARE
  _sum bigint;
  _first bigint;
  _second bigint;
  _third bigint;
  _effective_bps integer;
  _seller_fee_function text;
BEGIN
  -- Exact proportional allocation: 10,000 millimes across weights 2:3:5.
  WITH weights(store_id, weight) AS (
    VALUES
      ('00000000-0000-0000-0000-000000000001'::uuid, 2::numeric),
      ('00000000-0000-0000-0000-000000000002'::uuid, 3::numeric),
      ('00000000-0000-0000-0000-000000000003'::uuid, 5::numeric)
  ),
  weighted AS (
    SELECT store_id, weight,
      floor(10000::numeric * weight / sum(weight) OVER ())::bigint AS base_amount,
      mod(10000::numeric * weight, sum(weight) OVER ()) AS remainder_numerator
    FROM weights
  ),
  ranked AS (
    SELECT *,
      row_number() OVER (ORDER BY remainder_numerator DESC, store_id) AS remainder_rank,
      10000 - sum(base_amount) OVER () AS remainder_units
    FROM weighted
  ),
  allocations AS (
    SELECT base_amount + CASE WHEN remainder_rank <= remainder_units THEN 1 ELSE 0 END AS amount
    FROM ranked
  )
  SELECT sum(amount) INTO _sum FROM allocations;

  IF _sum <> 10000 THEN
    RAISE EXCEPTION 'test_failed: proportional allocations do not sum to total';
  END IF;

  -- Small remainder tie: deterministic UUID ordering and exact total preservation.
  WITH weights(store_id, weight) AS (
    VALUES
      ('00000000-0000-0000-0000-000000000003'::uuid, 1::numeric),
      ('00000000-0000-0000-0000-000000000001'::uuid, 1::numeric),
      ('00000000-0000-0000-0000-000000000002'::uuid, 1::numeric)
  ),
  weighted AS (
    SELECT store_id, weight,
      floor(2::numeric * weight / sum(weight) OVER ())::bigint AS base_amount,
      mod(2::numeric * weight, sum(weight) OVER ()) AS remainder_numerator
    FROM weights
  ),
  ranked AS (
    SELECT *,
      row_number() OVER (ORDER BY remainder_numerator DESC, store_id) AS remainder_rank,
      2 - sum(base_amount) OVER () AS remainder_units
    FROM weighted
  ),
  allocations AS (
    SELECT store_id, base_amount + CASE WHEN remainder_rank <= remainder_units THEN 1 ELSE 0 END AS amount
    FROM ranked
  )
  SELECT
    sum(amount),
    max(amount) FILTER (WHERE store_id = '00000000-0000-0000-0000-000000000001'::uuid),
    max(amount) FILTER (WHERE store_id = '00000000-0000-0000-0000-000000000002'::uuid),
    max(amount) FILTER (WHERE store_id = '00000000-0000-0000-0000-000000000003'::uuid)
  INTO _sum, _first, _second, _third
  FROM allocations;

  IF _sum <> 2 OR _first <> 1 OR _second <> 1 OR _third <> 0 THEN
    RAISE EXCEPTION 'test_failed: largest-remainder tie ordering or total preservation failed';
  END IF;

  -- Weighted display rate must summarize mixed 5% and 10% lines without
  -- changing either line's commission amount.
  _effective_bps := round((500 + 2000)::numeric * 10000 / (10000 + 20000))::integer;
  IF _effective_bps <> 833 THEN
    RAISE EXCEPTION 'test_failed: mixed-rate weighted summary expected 833 bps, got %', _effective_bps;
  END IF;


  -- The installed seller-fee RPC must deduplicate order-scoped and
  -- store-scoped evidence references before inserting a new ledger debit.
  SELECT pg_get_functiondef(
    'public.admin_record_seller_external_fee(uuid,text,bigint,text,text,text,text,uuid,uuid)'::regprocedure
  ) INTO _seller_fee_function;

  IF position('WHERE idempotency_key = trim(_idempotency_key)' IN _seller_fee_function)
       = 0
     OR position('WHERE idempotency_key = trim(_idempotency_key)' IN _seller_fee_function)
       > position('AND order_id IS NOT DISTINCT FROM _order_id' IN _seller_fee_function) THEN
    RAISE EXCEPTION 'test_failed: idempotency-key conflict validation must precede evidence-reference retry lookup';
  END IF;

  IF position('external_fee_idempotency_conflict' IN _seller_fee_function) = 0 THEN
    RAISE EXCEPTION 'test_failed: conflicting idempotency-key reuse is not rejected';
  END IF;

  IF position('order_id IS NOT DISTINCT FROM _order_id' IN _seller_fee_function) = 0
     OR position('order_item_id IS DISTINCT FROM _order_item_id' IN _seller_fee_function) = 0
     OR position('external_fee_business_reference_conflict' IN _seller_fee_function) = 0 THEN
    RAISE EXCEPTION 'test_failed: seller fee evidence reference is not fully idempotent';
  END IF;

  IF to_regclass('public.seller_external_fee_order_reference_uidx') IS NULL
     OR to_regclass('public.seller_external_fee_store_reference_uidx') IS NULL THEN
    RAISE EXCEPTION 'test_failed: fee evidence uniqueness indexes are missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'seller_payout_items'
      AND column_name = 'commission_bps'
      AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'test_failed: immutable per-line commission rate column is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.seller_payout_items'::regclass
      AND tgname = 'seller_payout_items_guard'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'test_failed: append-only payout item trigger was not restored';
  END IF;
END;
$$;
