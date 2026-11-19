-- Regression assertions for seller order privacy.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname = 'Sellers read orders containing their items'
  ) THEN
    RAISE EXCEPTION 'seller_direct_orders_policy_must_be_removed';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname = 'Customers read own orders'
      AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'customer_own_orders_policy_missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'orders'
      AND policyname = 'Admins read all orders'
      AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'admin_orders_policy_missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_items'
      AND policyname = 'Sellers read own order items'
      AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'seller_own_order_items_policy_missing';
  END IF;
END;
$$;
