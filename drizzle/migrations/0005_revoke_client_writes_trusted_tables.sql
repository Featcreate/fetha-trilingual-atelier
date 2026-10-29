REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.orders, public.order_items, public.order_item_files, public.payment_events,
  public.download_entitlements, public.download_reservations, public.entitlement_renewals,
  public.seller_ledger_entries, public.storage_cleanup_audit, public.platform_settings,
  public.product_file_versions, public.product_files
FROM anon, authenticated;