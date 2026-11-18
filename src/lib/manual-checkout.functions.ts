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
type ManualOrderRow = {
  order_reference: string;
  total_millimes: number;
  payment_method: PaymentMethod | null;
  payment_beneficiary_snapshot: string | null;
  payment_account_identifier_snapshot: string | null;
  payment_instructions_snapshot: string | null;
};
type ManualQuery<T> = {
  select: (columns: string) => {
    eq: (
      column: string,
      value: unknown,
    ) => {
      maybeSingle: () => Promise<{
        data: T | null;
        error: { message: string } | null;
      }>;
    };
  };
};
type ManualCheckoutClient = {
  from: {
    (table: "platform_payment_methods"): ManualQuery<ManualPaymentRow>;
    (table: "orders"): ManualQuery<ManualOrderRow>;
  };
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
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
      const result = await client
        .from("platform_payment_methods")
        .select("method,beneficiary_label,account_identifier,instructions,enabled")
        .eq("method", method)
        .maybeSingle();
      if (!result.error && result.data?.enabled === true)
        methods.push(result.data as ManualPaymentRow);
    }
    return { ok: true as const, methods };
  });

export const startManualCartCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        items: z
          .array(z.object({ productId: z.string().uuid() }))
          .min(1)
          .max(50),
        checkoutKey: z.string().min(8).max(100),
        method: z.enum(["flouci", "bank_transfer", "postal_transfer"]),
      })
      .parse(input),
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
    if (methodError)
      return {
        ok: false as const,
        error: methodError.message.includes("unavailable")
          ? "payment_method_unavailable"
          : "payment_method_failed",
      };

    const orderResult = await client
      .from("orders")
      .select(
        "order_reference,total_millimes,payment_method,payment_beneficiary_snapshot,payment_account_identifier_snapshot,payment_instructions_snapshot",
      )
      .eq("id", orderId)
      .maybeSingle();
    if (
      orderResult.error ||
      !orderResult.data ||
      orderResult.data.payment_method !== data.method ||
      !orderResult.data.payment_account_identifier_snapshot
    ) {
      return { ok: false as const, error: "checkout_details_unavailable" };
    }
    return {
      ok: true as const,
      orderId,
      orderReference: orderResult.data.order_reference as string,
      totalMillimes: orderResult.data.total_millimes as number,
      method: data.method,
      beneficiaryLabel: "Algorea Bazaar" as const,
      accountIdentifier: orderResult.data.payment_account_identifier_snapshot as string,
      instructions: (orderResult.data.payment_instructions_snapshot ?? "") as string,
    };
  });

export const submitSellerPayoutRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ storeId: z.string().uuid(), sellerNote: z.string().trim().max(1000).default("") })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: requestId, error } = await context.supabase.rpc("submit_seller_payout_request", {
      _store_id: data.storeId,
      _seller_note: data.sellerNote,
    });
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, requestId };
  });

export const getSellerPayoutPreview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ storeId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: preview, error } = await context.supabase.rpc("get_seller_payout_preview", {
      _store_id: data.storeId,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(preview) ? preview[0] : preview;
    return {
      earnedMillimes: Number(row?.earned_millimes ?? 0),
      paidOrReservedMillimes: Number(row?.paid_or_reserved_millimes ?? 0),
      transferFeesMillimes: Number(row?.transfer_fees_millimes ?? 0),
      availableMillimes: Number(row?.available_millimes ?? 0),
      minimumMillimes: Number(row?.minimum_millimes ?? 50000),
    };
  });
