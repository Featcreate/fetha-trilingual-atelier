-- Remove direct authenticated access only after the application uses the
-- service-role-only server wrappers introduced in migration 0046.
REVOKE EXECUTE ON FUNCTION public.admin_create_seller_payout(uuid,text,timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_mark_seller_payout_paid(uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_mark_seller_payout_failed(uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_commission_bps(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_ipay_checkout_enabled(boolean) FROM authenticated;


-- Revoke direct client execution after the application has switched to
-- service-role-only actor wrappers in migration 0046.
REVOKE EXECUTE ON FUNCTION public.create_seller_store(text,text,text,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.register_file_version(uuid,text,bigint,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.activate_file_version(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.archive_file_version(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_order(uuid[],text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_order_from_cart(jsonb,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_order_ipay_init(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_order_konnect_init(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_seller_rating(uuid,integer) FROM authenticated;

-- These privileged admin operations have no direct client call sites. Access is
-- retained only through the service-role-only wrappers created in migration 0046.
REVOKE EXECUTE ON FUNCTION public.admin_record_seller_external_fee(uuid,text,bigint,text,text,text,text,uuid,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_record_shared_seller_fee(uuid,text,bigint,text,text,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_renew_entitlement(uuid,integer,integer,text) FROM authenticated;

-- Public homepage access is served through the app server, not direct PostgREST RPC.
REVOKE EXECUTE ON FUNCTION public.get_top_rated_stores() FROM anon, authenticated;
