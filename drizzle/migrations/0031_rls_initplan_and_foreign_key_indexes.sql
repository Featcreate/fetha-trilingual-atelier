-- Performance-only migration: preserve existing row-visibility semantics.
-- Wrap auth context lookups in scalar SELECTs so PostgreSQL can evaluate them
-- once per statement rather than once per candidate row.
DO $$
DECLARE
  p record;
  new_qual text;
  new_check text;
  alter_sql text;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (coalesce(qual, '') ~* 'auth\.(uid|role)\s*\('
         AND coalesce(qual, '') !~* 'select\s+auth\.(uid|role)\s*\(')
        OR
        (coalesce(with_check, '') ~* 'auth\.(uid|role)\s*\('
         AND coalesce(with_check, '') !~* 'select\s+auth\.(uid|role)\s*\(')
      )
  LOOP
    new_qual := p.qual;
    new_check := p.with_check;

    IF new_qual IS NOT NULL THEN
      new_qual := regexp_replace(new_qual, 'auth\.uid\s*\(\)', '(select auth.uid())', 'gi');
      new_qual := regexp_replace(new_qual, 'auth\.role\s*\(\)', '(select auth.role())', 'gi');
    END IF;
    IF new_check IS NOT NULL THEN
      new_check := regexp_replace(new_check, 'auth\.uid\s*\(\)', '(select auth.uid())', 'gi');
      new_check := regexp_replace(new_check, 'auth\.role\s*\(\)', '(select auth.role())', 'gi');
    END IF;

    alter_sql := format('ALTER POLICY %I ON %I.%I',
      p.policyname, p.schemaname, p.tablename);

    IF p.cmd IN ('SELECT', 'UPDATE', 'DELETE', 'ALL') AND new_qual IS NOT NULL THEN
      alter_sql := alter_sql || format(' USING (%s)', new_qual);
    END IF;
    IF p.cmd IN ('INSERT', 'UPDATE', 'ALL') AND new_check IS NOT NULL THEN
      alter_sql := alter_sql || format(' WITH CHECK (%s)', new_check);
    END IF;
    EXECUTE alter_sql;
  END LOOP;
END
$$;

-- Cover foreign-key lookups reported without a matching index.
CREATE INDEX IF NOT EXISTS idx_download_entitlements_order_id
  ON public.download_entitlements (order_id);
CREATE INDEX IF NOT EXISTS idx_entitlement_renewals_entitlement_id
  ON public.entitlement_renewals (entitlement_id);
CREATE INDEX IF NOT EXISTS idx_order_item_files_file_version_id
  ON public.order_item_files (file_version_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id
  ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_store_id
  ON public.order_items (store_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_order_id
  ON public.payment_events (order_id);
CREATE INDEX IF NOT EXISTS idx_product_file_versions_store_id
  ON public.product_file_versions (store_id);
CREATE INDEX IF NOT EXISTS idx_seller_ledger_entries_store_id
  ON public.seller_ledger_entries (store_id);
CREATE INDEX IF NOT EXISTS idx_storage_cleanup_audit_file_version_id
  ON public.storage_cleanup_audit (file_version_id);
