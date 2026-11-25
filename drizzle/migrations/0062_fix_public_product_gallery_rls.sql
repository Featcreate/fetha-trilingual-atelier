-- Keep public gallery reads independent from the admin-only has_role helper.
-- The helper is SECURITY INVOKER and is intentionally not executable by anon.

DROP POLICY IF EXISTS "Anyone reads listed product preview images" ON public.product_images;

CREATE POLICY "Anyone reads listed product preview images"
  ON public.product_images FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = product_images.product_id
        AND p.is_active = true
        AND s.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.products p
      JOIN public.stores s ON s.id = p.store_id
      WHERE p.id = product_images.product_id
        AND s.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "Admins read all product preview images"
  ON public.product_images FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));
