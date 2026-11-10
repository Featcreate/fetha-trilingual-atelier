-- Persist a bounded retry cooldown for the iPay reconciliation worker.
-- This column only schedules verification attempts; it never changes order/payment state.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ipay_last_checked_at timestamptz;

CREATE INDEX IF NOT EXISTS orders_ipay_reconciliation_due_idx
  ON public.orders (ipay_last_checked_at, created_at)
  WHERE status = 'pending' AND ipay_payment_ref IS NOT NULL;

COMMENT ON COLUMN public.orders.ipay_last_checked_at IS
  'Last scheduled server-side iPay verification attempt; does not represent provider payment status.';
