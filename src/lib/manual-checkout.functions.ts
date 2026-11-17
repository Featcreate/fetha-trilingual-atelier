import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callActorScopedRpc } from "@/lib/actor-rpc.server";

type PaymentMethod = "flouci" | "bank_transfer" | "postal_transfer";
type ManualPaymentRow = {
  method: PaymentMethod;
  beneficiary_label: "Algorea Bazaar";
  account_identifier: string;
  instructions: string;
  enabled: boolean;
};
type ManualCheckoutClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        maybeSingle: () => Promise<{ data: any; error: { message: string } | null }>;
        order?: (column: string, options?: unknown) => unknown;
      };
    };
  };
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

async function manualClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as ManualCheckoutClient;
}

export const getPlatformPaymentMethods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const client = await manualClient();
    const methods: ManualPaymentRow[] = [];
    for (const method of ["flouci", "bank_transfer", "postal_transfer"] as const) {
      const result = await client.from("platform_payment_methods")
        .select("method,beneficiary_label,account_identifier,instructions,enabled")
        .eq("method", method).maybeSingle();
      if (!result.error && result.data?.enabled === true) methods.push(result.data as ManualPaymentRow);
    }
    return { ok: true as const, methods };
  });

export const startManualCartCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      items: z.array(z.object({ productId: z.string().uuid() })).min(1).max(50),
      checkoutKey: z.string().min(8).max(100),
      method: z.enum(["flouci", "bank_transfer", "postal_transfer"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rawOrderId, error } = await callActorScopedRpc(
      context.userId,
      "server_create_order_from_cart",
      {
        _items: data.items.map(({ productId }) => ({ productId, quantity: 1 })),
        _checkout_key: data.checkoutKey,
      },
    );
    const orderId = typeof rawOrderId === "string" ? rawOrderId : null;
    if (error || !orderId) return { ok: false as const, error: "order_failed" };

    const client = await manualClient();
    const { error: methodError } = await client.rpc("server_set_order_platform_payment_method", {
      _actor_id: context.userId,
      _order_id: orderId,
      _method: data.method,
    });
    if (methodError) return { ok: false as const, error: methodError.message.includes("unavailable") ? "payment_method_unavailable" : "payment_method_failed" };

    const orderResult = await client.from("orders").select("order_reference,total_millimes,payment_method").eq("id", orderId).maybeSingle();
    const methodResult = await client.from("platform_payment_methods").select("method,beneficiary_label,account_identifier,instructions,enabled").eq("method", data.method).maybeSingle();
    if (orderResult.error || !orderResult.data || methodResult.error || !methodResult.data?.enabled) {
      return { ok: false as const, error: "checkout_details_unavailable" };
    }
    return {
      ok: true as const,
      orderId,
      orderReference: orderResult.data.order_reference as string,
      totalMillimes: orderResult.data.total_millimes as number,
      method: data.method,
      beneficiaryLabel: "Algorea Bazaar" as const,
      accountIdentifier: methodResult.data.account_identifier as string,
      instructions: methodResult.data.instructions as string,
    };
  });

export const submitSellerPayoutRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ storeId: z.string().uuid(), sellerNote: z.string().trim().max(1000).default("") }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: requestId, error } = await context.supabase.rpc("submit_seller_payout_request", {
      _store_id: data.storeId,
      _seller_note: data.sellerNote,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, requestId };
  });
