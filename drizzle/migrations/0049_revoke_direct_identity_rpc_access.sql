-- Revoke direct client execution after the application has switched to
-- service-role-only actor wrappers in migration 0048.
REVOKE EXECUTE ON FUNCTION public.create_seller_store(text,text,text,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.register_file_version(uuid,text,bigint,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.activate_file_version(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.archive_file_version(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_order(uuid[],text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_order_from_cart(jsonb,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_order_ipay_init(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_order_konnect_init(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.submit_seller_rating(uuid,integer) FROM authenticated;

-- These privileged admin operations have no direct client call sites. Keep
-- them available to trusted service_role jobs only.
REVOKE EXECUTE ON FUNCTION public.admin_record_seller_external_fee(uuid,text,bigint,text,text,text,text,uuid,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_record_shared_seller_fee(uuid,text,bigint,text,text,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_renew_entitlement(uuid,integer,integer,text) FROM authenticated;
