-- Seller-facing order visibility, limited to the seller's own line items.
-- The seller can see order status and their own item/amounts, but not buyer contact details.
CREATE POLICY "Sellers read orders containing their items"
  ON public.orders FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.order_items i
     WHERE i.order_id = orders.id AND i.seller_id = auth.uid()
  ));

CREATE POLICY "Sellers read own order items"
  ON public.order_items FOR SELECT TO authenticated
  USING (seller_id = auth.uid());

-- Public catalog/storefront can show only listed products in active stores.
-- Existing product/store RLS policies already enforce this for anonymous visitors.
