import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function siteOrigin() {
  const configured = process.env["PUBLIC_SITE_URL"];
  if (configured) return configured.replace(/\/$/, "");
  return new URL(getRequest().url).origin;
}

/** Create (or reuse) the order with server-side prices, then a Konnect payment request. */
export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        productIds: z.array(z.string().uuid()).min(1).max(50),
        checkoutKey: z.string().min(8).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: orderId, error } = await context.supabase.rpc("create_order", {
      _product_ids: data.productIds,
      _checkout_key: data.checkoutKey,
    });
    if (error || !orderId) {
      const code = error?.message?.includes("product_unavailable") ? "product_unavailable" : "order_failed";
      return { ok: false as const, error: code };
    }

    const { data: order } = await context.supabase
      .from("orders")
      .select("id, status, total_millimes, konnect_pay_url, customer_email")
      .eq("id", orderId)
      .single();
    if (!order) return { ok: false as const, error: "order_failed" };
    if (order.status !== "pending") return { ok: false as const, error: "order_closed", orderId };
    if (order.konnect_pay_url) return { ok: true as const, orderId, payUrl: order.konnect_pay_url };

    const { konnectConfig, konnectInitPayment } = await import("./konnect.server");
    if (!konnectConfig()) return { ok: false as const, error: "payments_not_configured", orderId };

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", context.userId)
      .maybeSingle();
    const [firstName, ...rest] = (profile?.full_name ?? "").trim().split(/\s+/);

    const origin = siteOrigin();
    try {
      const { payUrl, paymentRef } = await konnectInitPayment({
        amount: order.total_millimes,
        orderId: order.id,
        description: `Algorea Bazaar #${order.id.slice(0, 8)}`,
        webhook: `${origin}/api/public/konnect/webhook`,
        successUrl: `${origin}/checkout/return?order=${order.id}`,
        failUrl: `${origin}/checkout/return?order=${order.id}`,
        firstName,
        lastName: rest.join(" "),
        phoneNumber: profile?.phone,
        email: order.customer_email ?? undefined,
      });
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin
        .from("orders")
        .update({ konnect_payment_ref: paymentRef, konnect_pay_url: payUrl })
        .eq("id", order.id)
        .eq("status", "pending")
        .is("konnect_payment_ref", null);
      const { data: saved } = await supabaseAdmin.from("orders").select("konnect_pay_url").eq("id", order.id).single();
      return { ok: true as const, orderId, payUrl: saved?.konnect_pay_url ?? payUrl };
    } catch {
      return { ok: false as const, error: "payment_provider_error", orderId };
    }
  });

/** Re-check an own order's payment with Konnect (never trusts redirect parameters). */
export const checkOrderPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: order } = await context.supabase
      .from("orders")
      .select("id, status, konnect_payment_ref")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { status: "not_found" as const };
    if (order.status === "pending" && order.konnect_payment_ref) {
      const { konnectConfig, applyPaymentRef } = await import("./konnect.server");
      if (konnectConfig()) {
        try {
          await applyPaymentRef(order.konnect_payment_ref, "return_check");
        } catch (e) {
          console.error("payment check failed", e instanceof Error ? e.message : "unknown");
        }
      }
    }
    const { data: fresh } = await context.supabase.from("orders").select("status").eq("id", data.orderId).single();
    return { status: (fresh?.status ?? order.status) as "pending" | "paid" | "failed" | "cancelled" };
  });

/**
 * Short-lived (300s) download link for the signed-in buyer of a paid order.
 * Reserve -> sign -> finalize; signing failure releases the reservation (no quota used).
 * Repeats within 5 minutes of a counted download re-sign without consuming an attempt.
 */
export const getDownloadLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ entitlementId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("reserve_download", {
      _user_id: context.userId,
      _entitlement_id: data.entitlementId,
    });
    const r = rows?.[0];
    if (error || !r) return { ok: false as const, error: "download_failed" };
    if (r.outcome !== "new" && r.outcome !== "dedupe") return { ok: false as const, error: r.outcome };
    const { data: signed, error: signErr } = await supabaseAdmin.storage
      .from("product-files")
      .createSignedUrl(r.storage_path!, 300, { download: r.file_name! });
    if (r.outcome === "dedupe") {
      if (signErr || !signed) return { ok: false as const, error: "file_missing" };
      return { ok: true as const, url: signed.signedUrl, counted: false };
    }
    if (signErr || !signed) {
      await supabaseAdmin.rpc("release_download", { _reservation_id: r.reservation_id! });
      return { ok: false as const, error: "file_missing" };
    }
    const { data: finalized } = await supabaseAdmin.rpc("finalize_download", { _reservation_id: r.reservation_id! });
    if (!finalized) return { ok: false as const, error: "download_failed" };
    return { ok: true as const, url: signed.signedUrl, counted: true };
  });

/** Admin test simulation: never produces seller ledger entries; blocked unless explicitly enabled and not live. */
export const adminSimulatePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (process.env["PAYMENT_SIMULATION_ENABLED"] !== "true" || process.env["KONNECT_ENV"] === "live") {
      return { ok: false as const, error: "simulation_disabled" };
    }
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) return { ok: false as const, error: "forbidden" };
    const { data: order } = await context.supabase.from("orders").select("total_millimes").eq("id", data.orderId).maybeSingle();
    if (!order) return { ok: false as const, error: "not_found" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: outcome, error } = await supabaseAdmin.rpc("settle_order_payment", {
      _order_id: data.orderId, _mode: "simulation", _payment_ref: `sim-${data.orderId}`,
      _amount_millimes: order.total_millimes, _source: "admin_simulation",
    });
    if (error) return { ok: false as const, error: "settlement_failed" };
    return { ok: true as const, outcome };
  });

/** Admin: re-verify a pending order with Konnect. */
export const adminRecheckPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) return { ok: false as const, error: "forbidden" };
    const { data: order } = await context.supabase
      .from("orders")
      .select("konnect_payment_ref")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order?.konnect_payment_ref) return { ok: false as const, error: "no_payment" };
    const { konnectConfig, applyPaymentRef } = await import("./konnect.server");
    if (!konnectConfig()) return { ok: false as const, error: "payments_not_configured" };
    try {
      const r = await applyPaymentRef(order.konnect_payment_ref, "admin_check");
      return { ok: true as const, outcome: r.outcome };
    } catch {
      return { ok: false as const, error: "payment_provider_error" };
    }
  });
