-- Cover the remaining foreign keys on seller external fee records.
CREATE INDEX IF NOT EXISTS seller_external_fee_order_item_idx
  ON public.seller_external_fee_entries(order_item_id)
  WHERE order_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS seller_external_fee_recorded_by_idx
  ON public.seller_external_fee_entries(recorded_by);
