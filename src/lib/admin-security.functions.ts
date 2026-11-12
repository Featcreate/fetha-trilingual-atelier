import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type RpcError = { message: string } | null;
type AdminRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ error: RpcError }>;
};

async function runAdminRpc(
  context: { supabase: SupabaseClient<Database>; userId: string },
  functionName: string,
  args: Record<string, unknown>,
) {
  const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (roleError || isAdmin !== true) return { error: { message: "forbidden" } };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const adminClient = supabaseAdmin as unknown as AdminRpcClient;
  const { error } = await adminClient.rpc(functionName, {
    _actor_id: context.userId,
    ...args,
  });
  return { error: error ? { message: error.message } : null };
}

export const adminSetCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ bps: z.number().int().min(0).max(10000) }).parse(input),
  )
  .handler(({ data, context }) =>
    runAdminRpc(context, "server_admin_set_commission_bps", { _bps: data.bps }),
  );

export const adminSetIpayCheckoutEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(({ data, context }) =>
    runAdminRpc(context, "server_admin_set_ipay_checkout_enabled", {
      _enabled: data.enabled,
    }),
  );

export const adminCreateSellerPayout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        storeId: z.string().uuid(),
        idempotencyKey: z.string().min(8).max(200),
      })
      .parse(input),
  )
  .handler(({ data, context }) =>
    runAdminRpc(context, "server_admin_create_seller_payout", {
      _store_id: data.storeId,
      _idempotency_key: data.idempotencyKey,
      _scheduled_for: null,
    }),
  );

export const adminMarkSellerPayoutPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        payoutId: z.string().uuid(),
        transferReference: z.string().trim().min(3).max(200),
      })
      .parse(input),
  )
  .handler(({ data, context }) =>
    runAdminRpc(context, "server_admin_mark_seller_payout_paid", {
      _payout_id: data.payoutId,
      _transfer_reference: data.transferReference,
    }),
  );

export const adminMarkSellerPayoutFailed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        payoutId: z.string().uuid(),
        failureReason: z.string().trim().min(3).max(500),
      })
      .parse(input),
  )
  .handler(({ data, context }) =>
    runAdminRpc(context, "server_admin_mark_seller_payout_failed", {
      _payout_id: data.payoutId,
      _failure_reason: data.failureReason,
    }),
  );
