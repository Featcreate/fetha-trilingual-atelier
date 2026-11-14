// Server-only cleanup for abandoned unpaid orders.
export async function runExpiredUnpaidOrderCleanup(): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("cleanup_expired_unpaid_orders", {
    _limit: 100,
  });

  if (error) {
    console.error("Expired unpaid order cleanup failed", error.message);
    throw new Error("expired_order_cleanup_failed");
  }

  const deleted = Number(data);
  if (!Number.isInteger(deleted) || deleted < 0 || deleted > 100) {
    throw new Error("expired_order_cleanup_invalid_result");
  }
  return deleted;
}
