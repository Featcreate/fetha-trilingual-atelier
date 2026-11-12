-- Remove direct authenticated access only after the application uses the
-- service-role-only server wrappers introduced in migration 0046.
REVOKE EXECUTE ON FUNCTION public.admin_create_seller_payout(uuid,text,timestamptz) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_mark_seller_payout_paid(uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_mark_seller_payout_failed(uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_commission_bps(integer) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_ipay_checkout_enabled(boolean) FROM authenticated;
