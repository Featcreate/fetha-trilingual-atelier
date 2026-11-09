import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const packagePrices: Record<number, number> = {
  7: 20_000,
  14: 35_000,
  30: 60_000,
};

const requestInput = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(1000),
  destinationUrl: z.string().url().refine((value) => new URL(value).protocol === "https:"),
  imagePath: z.string().min(5).max(500),
  durationDays: z.union([z.literal(7), z.literal(14), z.literal(30)]),
});

export const createPaidAdvertisingRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const imagePrefix = `${context.userId}/`;
    if (!data.imagePath.startsWith(imagePrefix) || data.imagePath.includes("..")) {
      return { ok: false as const, error: "invalid_creative_path" };
    }

    const imageName = data.imagePath.slice(imagePrefix.length);
    const { data: objects, error: storageError } = await supabaseAdmin.storage
      .from("advertising-assets")
      .list(context.userId, { limit: 100 });
    if (storageError || !objects?.some((object) => object.name === imageName)) {
      return { ok: false as const, error: "creative_not_found" };
    }

    const db = supabaseAdmin as unknown as {
      from: (table: string) => {
        insert: (row: Record<string, unknown>) => {
          select: (columns: string) => {
            single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
          };
        };
      };
    };
    const { data: row, error } = await db.from("paid_advertising_orders").insert({
      advertiser_id: context.userId,
      title: data.title,
      description: data.description,
      image_path: data.imagePath,
      destination_url: data.destinationUrl,
      duration_days: data.durationDays,
      price_millimes: packagePrices[data.durationDays],
      currency: "TND",
      status: "awaiting_payment",
      payment_status: "pending",
      payment_provider: "ipay",
    }).select("id").single();

    if (error || !row) {
      console.error("Paid advertising request creation failed", error?.message ?? "unknown");
      return { ok: false as const, error: "request_creation_failed" };
    }
    return { ok: true as const, requestId: row.id, priceMillimes: packagePrices[data.durationDays] };
  });

export const adminListPaidAdvertisingRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !isAdmin) return { ok: false as const, error: "forbidden" };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          order: (column: string, options: { ascending: boolean }) => {
            limit: (count: number) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
          };
        };
      };
    };
    const { data, error } = await db.from("paid_advertising_orders")
      .select("id,advertiser_id,title,description,image_path,destination_url,duration_days,price_millimes,status,payment_status,ipay_payment_ref,paid_at,created_at,starts_at,ends_at")
      .order("created_at", { ascending: false }).limit(100);
    if (error) return { ok: false as const, error: "load_failed" };
    return { ok: true as const, requests: data ?? [] };
  });

export const adminActivatePaidAdvertisingRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ requestId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError || !isAdmin) return { ok: false as const, error: "forbidden" };
    const rpc = context.supabase.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;
    const { data: outcome, error } = await rpc("admin_activate_paid_advertising_order", {
      _ad_id: data.requestId,
    });
    if (error) {
      const code = error.message.includes("payment_not_verified")
        ? "payment_not_verified"
        : error.message.includes("slots_full")
          ? "slots_full"
          : error.message.includes("not_found")
            ? "not_found"
            : "activation_failed";
      return { ok: false as const, error: code };
    }
    return { ok: true as const, outcome };
  });

export const getMyPaidAdvertisingRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            order: (column: string, options: { ascending: boolean }) => {
              limit: (count: number) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
            };
          };
        };
      };
    };
    const { data, error } = await db.from("paid_advertising_orders")
      .select("id,title,duration_days,price_millimes,status,payment_status,created_at,starts_at,ends_at")
      .eq("advertiser_id", context.userId)
      .order("created_at", { ascending: false }).limit(20);
    if (error) return { ok: false as const, error: "load_failed" };
    return { ok: true as const, requests: data ?? [] };
  });

export const getPublicPaidAdvertisements = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {
      from: (table: string) => {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            lte: (column: string, value: string) => {
              gt: (column: string, value: string) => {
                order: (column: string, options: { ascending: boolean }) => {
                  limit: (count: number) => Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>;
                };
              };
            };
          };
        };
      };
    };
    const now = new Date().toISOString();
    const { data, error } = await db.from("paid_advertising_orders")
      .select("id,title,description,image_path,destination_url,starts_at,ends_at")
      .eq("status", "active")
      .eq("payment_status", "verified")
      .lte("starts_at", now)
      .gt("ends_at", now)
      .order("starts_at", { ascending: true })
      .limit(3);
    if (error) return { ok: false as const, advertisements: [] as Record<string, unknown>[] };
    return { ok: true as const, advertisements: data ?? [] };
  });
