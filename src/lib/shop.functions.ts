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
    const { konnectConfig, konnectInitPayment } = await import("./konnect.server");
    if (!konnectConfig(true)) return { ok: false as const, error: "payments_not_configured" };

    const { data: orderId, error } = await context.supabase.rpc("create_order", {
      _product_ids: data.productIds,
      _checkout_key: data.checkoutKey,
    });
    if (error || !orderId) {
      const code = error?.message?.includes("product_unavailable")
        ? "product_unavailable"
        : error?.message?.includes("commission_not_configured")
          ? "commission_not_configured"
          : "order_failed";
      return { ok: false as const, error: code };
    }

    const { data: order } = await context.supabase
      .from("orders")
      .select("id, status, total_millimes, konnect_pay_url, customer_email")
      .eq("id", orderId)
      .single();
    if (!order) return { ok: false as const, error: "order_failed" };
    if (order.status !== "pending") {
      return { ok: false as const, error: "order_closed", orderId };
    }
    if (order.konnect_pay_url) return { ok: true as const, orderId, payUrl: order.konnect_pay_url };

    const { data: claimRows, error: claimError } = await context.supabase.rpc(
      "claim_order_konnect_init",
      { _order_id: order.id },
    );
    const claim = claimRows?.[0] as { outcome?: string; pay_url?: string | null } | undefined;
    if (claimError || !claim) {
      return { ok: false as const, error: "payment_initialization_uncertain", orderId };
    }
    if (claim.outcome === "existing" && claim.pay_url) {
      return { ok: true as const, orderId, payUrl: claim.pay_url };
    }
    if (claim.outcome !== "claimed") {
      return {
        ok: false as const,
        error:
          claim.outcome === "order_closed" ? "order_closed" : "payment_initialization_uncertain",
        orderId,
      };
    }

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
      const { error: saveError } = await supabaseAdmin
        .from("orders")
        .update({ konnect_payment_ref: paymentRef, konnect_pay_url: payUrl })
        .eq("id", order.id)
        .eq("status", "pending")
        .not("konnect_init_claimed_at", "is", null)
        .is("konnect_payment_ref", null);
      const { data: saved, error: readError } = await supabaseAdmin
        .from("orders")
        .select("konnect_payment_ref,konnect_pay_url")
        .eq("id", order.id)
        .single();
      if (readError || !saved?.konnect_payment_ref || !saved.konnect_pay_url) {
        console.error(
          "Konnect payment reference could not be persisted",
          saveError?.message ?? readError?.message ?? "missing_payment_reference",
        );
        return { ok: false as const, error: "payment_reference_save_failed", orderId };
      }
      return { ok: true as const, orderId, payUrl: saved.konnect_pay_url };
    } catch {
      return { ok: false as const, error: "payment_provider_error", orderId };
    }
  });

/** Public-safe status only; never exposes provider credentials. */
export const getCartCheckoutAvailability = createServerFn({ method: "GET" }).handler(async () => {
  const { konnectConfig } = await import("./konnect.server");
  return { enabled: Boolean(konnectConfig(true)) };
});

/** Create one pending order with one entitlement per distinct digital product, then request one Konnect charge.
 * The activation gate is checked before an order is created; disabled payments fail closed. */
export const startCartCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        items: z
          .array(
            z.object({
              productId: z.string().uuid(),
            }),
          )
          .min(1)
          .max(50),
        checkoutKey: z.string().min(8).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { konnectConfig, konnectInitPayment } = await import("./konnect.server");
    if (!konnectConfig(true)) return { ok: false as const, error: "payments_not_configured" };

    const { data: orderId, error } = await context.supabase.rpc("create_order_from_cart", {
      _items: data.items.map(({ productId }) => ({ productId, quantity: 1 })),
      _checkout_key: data.checkoutKey,
    });
    if (error || !orderId) {
      const code = error?.message?.includes("product_unavailable")
        ? "product_unavailable"
        : error?.message?.includes("commission_not_configured")
          ? "commission_not_configured"
          : "order_failed";
      return { ok: false as const, error: code };
    }

    const { data: order } = await context.supabase
      .from("orders")
      .select("id,status,total_millimes,konnect_pay_url,customer_email")
      .eq("id", orderId)
      .single();
    if (!order) return { ok: false as const, error: "order_failed" };
    if (order.status !== "pending") {
      return { ok: false as const, error: "order_closed", orderId };
    }
    if (order.konnect_pay_url) {
      return { ok: true as const, orderId, payUrl: order.konnect_pay_url };
    }

    const { data: claimRows, error: claimError } = await context.supabase.rpc(
      "claim_order_konnect_init",
      { _order_id: order.id },
    );
    const claim = claimRows?.[0] as { outcome?: string; pay_url?: string | null } | undefined;
    if (claimError || !claim) {
      return { ok: false as const, error: "payment_initialization_uncertain", orderId };
    }
    if (claim.outcome === "existing" && claim.pay_url) {
      return { ok: true as const, orderId, payUrl: claim.pay_url };
    }
    if (claim.outcome !== "claimed") {
      return {
        ok: false as const,
        error:
          claim.outcome === "order_closed" ? "order_closed" : "payment_initialization_uncertain",
        orderId,
      };
    }

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name,phone")
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
      const { error: saveError } = await supabaseAdmin
        .from("orders")
        .update({ konnect_payment_ref: paymentRef, konnect_pay_url: payUrl })
        .eq("id", order.id)
        .eq("status", "pending")
        .not("konnect_init_claimed_at", "is", null)
        .is("konnect_payment_ref", null);
      const { data: saved, error: readError } = await supabaseAdmin
        .from("orders")
        .select("konnect_payment_ref,konnect_pay_url")
        .eq("id", order.id)
        .single();
      if (readError || !saved?.konnect_payment_ref || !saved.konnect_pay_url) {
        console.error(
          "Konnect cart payment reference could not be persisted",
          saveError?.message ?? readError?.message ?? "missing_payment_reference",
        );
        return { ok: false as const, error: "payment_reference_save_failed", orderId };
      }
      return { ok: true as const, orderId, payUrl: saved.konnect_pay_url };
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
    const { data: fresh } = await context.supabase
      .from("orders")
      .select("status")
      .eq("id", data.orderId)
      .single();
    return {
      status: (fresh?.status ?? order.status) as "pending" | "paid" | "failed" | "cancelled",
    };
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
    const { issueDownload } = await import("./download-flow");
    return issueDownload({
      reserve: async () => {
        const { data: rows, error } = await supabaseAdmin.rpc("reserve_download", {
          _user_id: context.userId,
          _entitlement_id: data.entitlementId,
        });
        return error ? null : (rows?.[0] ?? null);
      },
      sign: async (path, seconds, fileName) => {
        const { data: signed, error } = await supabaseAdmin.storage
          .from("product-files")
          .createSignedUrl(path, seconds, { download: fileName });
        return error || !signed ? null : signed.signedUrl;
      },
      finalize: async (id) => {
        const { data: ok, error } = await supabaseAdmin.rpc("finalize_download", {
          _reservation_id: id,
        });
        return !error && ok === true;
      },
      release: async (id) => {
        await supabaseAdmin.rpc("release_download", { _reservation_id: id });
      },
    });
  });

/** Admin test simulation: never produces seller ledger entries; blocked unless explicitly enabled and not live. */
export const adminSimulatePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    if (
      process.env["PAYMENT_SIMULATION_ENABLED"] !== "true" ||
      process.env["KONNECT_ENV"] === "live"
    ) {
      return { ok: false as const, error: "simulation_disabled" };
    }
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) return { ok: false as const, error: "forbidden" };
    const { data: order } = await context.supabase
      .from("orders")
      .select("total_millimes")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) return { ok: false as const, error: "not_found" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: outcome, error } = await supabaseAdmin.rpc("settle_order_payment", {
      _order_id: data.orderId,
      _mode: "simulation",
      _payment_ref: `sim-${data.orderId}`,
      _amount_millimes: order.total_millimes,
      _source: "admin_simulation",
    });
    if (error) return { ok: false as const, error: "settlement_failed" };
    return { ok: true as const, outcome };
  });

/** Admin: re-verify a pending order with Konnect. */
export const adminRecheckPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ orderId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
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

/** Initialize one iPay hosted checkout for the authenticated buyer's entire cart.
 * The returned URL only redirects to iPay; it never marks an order as paid. */
export const getIpayCheckoutAvailability = createServerFn({ method: "GET" }).handler(async () => {
    const { ipayConfig, isIpayCheckoutEnabled } = await import("./ipay.server");
    const cfg = ipayConfig(true);
    if (!cfg) return { enabled: false };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings, error } = await supabaseAdmin
      .from("platform_settings")
      .select("ipay_checkout_enabled")
      .eq("id", true)
      .maybeSingle();
    return {
      enabled: !error && isIpayCheckoutEnabled(settings?.ipay_checkout_enabled === true),
    };
});

export const startCartIpayCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        items: z
          .array(z.object({ productId: z.string().uuid() }))
          .min(1)
          .max(50),
        checkoutKey: z.string().min(8).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { ipayConfig, ipayCreateOneShot, isIpayCheckoutEnabled } = await import(
      "./ipay.server"
    );
    const cfg = ipayConfig(true);
    if (!cfg) return { ok: false as const, error: "ipay_not_configured" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("platform_settings")
      .select("ipay_checkout_enabled")
      .eq("id", true)
      .maybeSingle();
    if (
      settingsError ||
      !isIpayCheckoutEnabled(settings?.ipay_checkout_enabled === true)
    ) {
      return { ok: false as const, error: "ipay_checkout_disabled" };
    }

    const { data: orderId, error } = await context.supabase.rpc("create_order_from_cart", {
      _items: data.items.map(({ productId }) => ({ productId, quantity: 1 })),
      _checkout_key: data.checkoutKey,
    });
    if (error || !orderId) {
      const code = error?.message?.includes("product_unavailable")
        ? "product_unavailable"
        : error?.message?.includes("commission_not_configured")
          ? "commission_not_configured"
          : "order_failed";
      return { ok: false as const, error: code };
    }

    const { data: order } = await context.supabase
      .from("orders")
      .select("id,status,total_millimes,ipay_payment_url,customer_email")
      .eq("id", orderId)
      .single();
    if (!order) return { ok: false as const, error: "order_failed" };
    if (order.status !== "pending") return { ok: false as const, error: "order_closed", orderId };
    if (order.ipay_payment_url) {
      return { ok: true as const, orderId, payUrl: order.ipay_payment_url };
    }

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("full_name")
      .eq("id", context.userId)
      .maybeSingle();
    const customerName = (profile?.full_name ?? "").trim();
    if (!customerName) {
      return { ok: false as const, error: "customer_name_required", orderId };
    }

    const { data: claims, error: claimError } = await context.supabase.rpc(
      "claim_order_ipay_init",
      { _order_id: order.id },
    );
    const claim = claims?.[0] as { outcome?: string; pay_url?: string | null } | undefined;
    if (claimError || !claim) {
      return { ok: false as const, error: "payment_initialization_uncertain", orderId };
    }
    if (claim.outcome === "existing" && claim.pay_url) {
      return { ok: true as const, orderId, payUrl: claim.pay_url };
    }
    if (claim.outcome !== "claimed") {
      const { ipayInitClaimError } = await import("./ipay.server");
      return { ok: false as const, error: ipayInitClaimError(claim.outcome), orderId };
    }

    try {
      const { paymentUrl, paymentRef } = await ipayCreateOneShot({
        amountMillimes: order.total_millimes,
        orderId: order.id,
        customerName,
      });
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error: saveError } = await supabaseAdmin
        .from("orders")
        .update({ ipay_payment_ref: paymentRef, ipay_payment_url: paymentUrl })
        .eq("id", order.id)
        .eq("status", "pending")
        .not("ipay_init_claimed_at", "is", null)
        .is("ipay_payment_ref", null);
      const { data: saved, error: readError } = await supabaseAdmin
        .from("orders")
        .select("ipay_payment_ref,ipay_payment_url")
        .eq("id", order.id)
        .single();
      if (saveError || readError || !saved?.ipay_payment_ref || !saved.ipay_payment_url) {
        console.error(
          "iPay checkout reference could not be persisted",
          saveError?.message ?? readError?.message ?? "missing_reference",
        );
        return { ok: false as const, error: "payment_reference_save_failed", orderId };
      }
      return { ok: true as const, orderId, payUrl: saved.ipay_payment_url };
    } catch (e) {
      // Keep the initialization claim locked: a timeout may mean iPay created a
      // transaction but its response was lost. Never retry automatically.
      console.error(
        "iPay checkout initialization outcome is uncertain; manual reconciliation required",
        e instanceof Error ? e.message : "unknown",
      );
      return { ok: false as const, error: "payment_provider_error", orderId };
    }
  });
