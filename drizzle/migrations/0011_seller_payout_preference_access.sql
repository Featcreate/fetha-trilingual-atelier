-- Sellers may manage only their own weekly-manual payout preference.
-- Direct Konnect payouts remain disabled until provider capability is verified.
GRANT INSERT, UPDATE ON public.seller_payout_preferences TO authenticated;

DROP POLICY IF EXISTS "Sellers manage own payout preference" ON public.seller_payout_preferences;
CREATE POLICY "Sellers manage own payout preference"
  ON public.seller_payout_preferences FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = seller_payout_preferences.store_id
        AND s.owner_id = auth.uid()
        AND s.status = 'active'
    )
  )
  WITH CHECK (
    method = 'weekly_manual'
    AND EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = seller_payout_preferences.store_id
        AND s.owner_id = auth.uid()
        AND s.status = 'active'
    )
  );
