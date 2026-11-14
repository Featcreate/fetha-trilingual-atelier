-- Physically remove only abandoned pending orders that never began a provider attempt.
-- Payment events are retained by their existing ON DELETE SET NULL relationship.
CREATE OR REPLACE FUNCTION public.cleanup_expired_unpaid_orders(_limit integer DEFAULT 100)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _order_id uuid;
  _deleted integer := 0;
BEGIN
  IF _limit IS NULL OR _limit < 1 OR _limit > 500 THEN
    RAISE EXCEPTION 'invalid_cleanup_limit';
  END IF;

  FOR _order_id IN
    SELECT o.id
      FROM public.orders AS o
     WHERE o.status = 'pending'
       AND o.created_at < now() - interval '24 hours'
       -- Claims are written before contacting a provider. Any claim or reference
       -- means a request may have reached the provider even if its response was lost.
       AND o.ipay_payment_ref IS NULL
       AND o.ipay_payment_url IS NULL
       AND o.ipay_init_claimed_at IS NULL
       AND o.konnect_payment_ref IS NULL
       AND o.konnect_pay_url IS NULL
       AND o.konnect_init_claimed_at IS NULL
       -- Never delete orders that have generated entitlements or financial records.
       AND NOT EXISTS (
         SELECT 1 FROM public.provider_payment_settlements s WHERE s.order_id = o.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.download_entitlements e WHERE e.order_id = o.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.platform_financial_ledger_entries l
          WHERE l.order_id = o.id
             OR l.order_item_id IN (
               SELECT oi.id FROM public.order_items oi WHERE oi.order_id = o.id
             )
       )
       AND NOT EXISTS (
         SELECT 1 FROM public.seller_external_fee_entries f
          WHERE f.order_id = o.id
             OR f.order_item_id IN (
               SELECT oi.id FROM public.order_items oi WHERE oi.order_id = o.id
             )
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.seller_ledger_entries l
           JOIN public.order_items oi ON oi.id = l.order_item_id
          WHERE oi.order_id = o.id
       )
       AND NOT EXISTS (
         SELECT 1
           FROM public.seller_payout_items p
           JOIN public.order_items oi ON oi.id = p.order_item_id
          WHERE oi.order_id = o.id
       )
     ORDER BY o.created_at, o.id
     FOR UPDATE OF o SKIP LOCKED
     LIMIT _limit
  LOOP
    -- order_item_files can be removed only because the entitlement blocker above
    -- guarantees no download entitlement references any file for this order.
    DELETE FROM public.order_item_files f
     USING public.order_items oi
     WHERE f.order_item_id = oi.id
       AND oi.order_id = _order_id;

    DELETE FROM public.order_items WHERE order_id = _order_id;
    -- payment_events.order_id is ON DELETE SET NULL, preserving the audit events.
    DELETE FROM public.orders WHERE id = _order_id AND status = 'pending';
    IF FOUND THEN
      _deleted := _deleted + 1;
    END IF;
  END LOOP;

  RETURN _deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_unpaid_orders(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_unpaid_orders(integer)
  TO service_role;

COMMENT ON FUNCTION public.cleanup_expired_unpaid_orders(integer) IS
  'Daily cleanup of pending orders older than 24 hours only when no provider attempt, payment settlement, entitlement, payout, or financial ledger record exists. Preserves payment_events.';
