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


/** Read-only iPay authentication check. Returns only sanitized health metadata. */
export const adminCheckIpayConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || isAdmin !== true) {
      return { ok: false as const, authenticated: false as const, error: "forbidden" as const };
    }

    const { ipayGetWebhookHealth } = await import("@/lib/ipay.server");
    const missing = [
      ...(!process.env["IPAY_ORG_ID"] ? ["IPAY_ORG_ID"] : []),
      ...(!process.env["IPAY_JWT"] ? ["IPAY_JWT"] : []),
    ];
    if (missing.length > 0) {
      return {
        ok: false as const,
        authenticated: false as const,
        error: "missing_server_configuration" as const,
        missing,
      };
    }

    try {
      const raw = (await ipayGetWebhookHealth(false)) as {
        overall_healthy?: unknown;
        products?: Array<{
          product_code?: unknown;
          product_name?: unknown;
          healthy?: unknown;
          webhook_success?: { configured?: unknown };
          webhook_failure?: { configured?: unknown };
        }>;
      };
      return {
        ok: true as const,
        authenticated: true as const,
        overallHealthy: raw.overall_healthy === true,
        products: Array.isArray(raw.products)
          ? raw.products.map((product) => ({
              productCode:
                typeof product.product_code === "string" ? product.product_code : null,
              productName:
                typeof product.product_name === "string" ? product.product_name : null,
              healthy: product.healthy === true,
              successWebhookConfigured: product.webhook_success?.configured === true,
              failureWebhookConfigured: product.webhook_failure?.configured === true,
            }))
          : [],
      };
    } catch {
      return {
        ok: false as const,
        authenticated: false as const,
        error: "provider_request_failed" as const,
      };
    }
  });
