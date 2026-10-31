// Server-only. Import dynamically from inside server handlers.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decidePaymentOutcome, type KonnectPayment, type PaymentOutcome } from "./payment-rules";
import { isKonnectPaymentEnabled } from "./payment-activation";

const SANDBOX = "https://api.preprod.konnect.network/api/v2";
const LIVE = "https://api.konnect.network/api/v2";

export function konnectConfig() {
  const apiKey = process.env["KONNECT_API_KEY"];
  const walletId = process.env["KONNECT_WALLET_ID"];
  const mode = process.env["KONNECT_ENV"];
  if (!isKonnectPaymentEnabled({
    KONNECT_ENV: mode,
    KONNECT_SANDBOX_PAYMENTS_ENABLED: process.env["KONNECT_SANDBOX_PAYMENTS_ENABLED"],
    KONNECT_LIVE_PAYMENTS_ENABLED: process.env["KONNECT_LIVE_PAYMENTS_ENABLED"],
  })) return null;
  if (!apiKey || !walletId) return null;
  const live = mode === "live";
  return { apiKey, walletId, base: live ? LIVE : SANDBOX, live };
}

export async function konnectInitPayment(input: {
  amount: number;
  orderId: string;
  description: string;
  webhook: string;
  successUrl: string;
  failUrl: string;
  firstName?: string | undefined;
  lastName?: string | undefined;
  phoneNumber?: string | undefined;
  email?: string | undefined;
}): Promise<{ payUrl: string; paymentRef: string }> {
  const cfg = konnectConfig();
  if (!cfg) throw new Error("payments_not_configured");
  const res = await fetch(`${cfg.base}/payments/init-payment`, {
    method: "POST",
    headers: { "x-api-key": cfg.apiKey, "content-type": "application/json" },
    body: JSON.stringify({
      receiverWalletId: cfg.walletId,
      token: "TND",
      amount: input.amount,
      type: "immediate",
      description: input.description,
      acceptedPaymentMethods: ["wallet", "bank_card", "e-DINAR"],
      lifespan: 30,
      checkoutForm: false,
      addPaymentFeesToAmount: false,
      firstName: input.firstName || undefined,
      lastName: input.lastName || undefined,
      phoneNumber: input.phoneNumber || undefined,
      email: input.email || undefined,
      orderId: input.orderId,
      webhook: input.webhook,
      successUrl: input.successUrl,
      failUrl: input.failUrl,
    }),
  });
  if (!res.ok) {
    console.error("Konnect init-payment failed", res.status);
    throw new Error("payment_provider_error");
  }
  const json = (await res.json()) as { payUrl?: string; paymentRef?: string };
  if (!json.payUrl || !json.paymentRef) throw new Error("payment_provider_error");
  return { payUrl: json.payUrl, paymentRef: json.paymentRef };
}

async function konnectGetPayment(paymentRef: string): Promise<KonnectPayment> {
  const cfg = konnectConfig();
  if (!cfg) throw new Error("payments_not_configured");
  const res = await fetch(`${cfg.base}/payments/${encodeURIComponent(paymentRef)}`, {
    headers: { "x-api-key": cfg.apiKey },
  });
  if (!res.ok) throw new Error(`konnect_status_${res.status}`);
  const json = (await res.json()) as { payment?: KonnectPayment };
  return json.payment ?? {};
}

/**
 * Verify a payment with Konnect (server-to-server) and apply it to its order.
 * Idempotent: the order flips pending -> paid at most once.
 */
export async function applyPaymentRef(
  paymentRef: string,
  source: "webhook" | "return_check" | "admin_check",
) {
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, status, total_millimes")
    .eq("konnect_payment_ref", paymentRef)
    .maybeSingle();

  if (!order) {
    await supabaseAdmin
      .from("payment_events")
      .insert({ payment_ref: paymentRef, source, outcome: "unknown_order" });
    return { outcome: "unknown_order" as const };
  }

  // Provider verification (server-to-server with our secret key). Webhook/return params are never trusted.
  const payment = await konnectGetPayment(paymentRef);
  const outcome: PaymentOutcome = decidePaymentOutcome(order, payment);
  if (outcome !== "paid") {
    await supabaseAdmin.from("payment_events").insert({
      order_id: order.id,
      payment_ref: paymentRef,
      source,
      konnect_status: payment.status ?? null,
      outcome,
    });
    return { outcome };
  }
  // Single trusted, transactional, idempotent settlement (service role only).
  const { data, error } = await supabaseAdmin.rpc("settle_order_payment", {
    _order_id: order.id,
    _mode: "verified",
    _payment_ref: paymentRef,
    _amount_millimes: payment.amount ?? -1,
    _source: source,
  });
  if (error) throw new Error("settlement_failed");
  if (data === "paid")
    await supabaseAdmin
      .from("orders")
      .update({ email_error: "email_not_configured" })
      .eq("id", order.id);
  return { outcome: data as string };
}
