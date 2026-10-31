-- Seller onboarding and seller-managed payout preference access.
-- Additive hardening only. No payment processing or transfer is enabled.

-- Require a confirmed Supabase email at the database boundary, not only in the UI.
CREATE OR REPLACE FUNCTION public.require_confirmed_email_for_store()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid() AND u.email_confirmed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'email_confirmation_required';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS stores_require_confirmed_email ON public.stores;
CREATE TRIGGER stores_require_confirmed_email
  BEFORE INSERT ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.require_confirmed_email_for_store();

-- Seller may choose only the already-supported weekly manual method.
-- konnect_direct remains disabled by platform_settings and its guard trigger.
GRANT INSERT, UPDATE ON public.seller_payout_preferences TO authenticated;

DROP POLICY IF EXISTS "Sellers manage own payout preference" ON public.seller_payout_preferences;
CREATE POLICY "Sellers manage own payout preference"
  ON public.seller_payout_preferences FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.stores s
      WHERE s.id = seller_payout_preferences.store_id
        AND s.owner_id = auth.uid() AND s.status = 'active')
  )
  WITH CHECK (
    method = 'weekly_manual'
    AND EXISTS (SELECT 1 FROM public.stores s
      WHERE s.id = seller_payout_preferences.store_id
        AND s.owner_id = auth.uid() AND s.status = 'active')
  );

-- Keep supported digital product types aligned with the seller form.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_product_type_check;
ALTER TABLE public.products ADD CONSTRAINT products_product_type_check
  CHECK (product_type IN ('ebook','pdf','template','educational','bundle','software','app','printable','planner','course','audio','video','graphics','other'));
