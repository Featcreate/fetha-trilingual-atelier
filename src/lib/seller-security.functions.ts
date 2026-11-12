import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createSellerStore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(120),
        slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/),
        privacyVersion: z.string().min(1).max(80),
        termsVersion: z.string().min(1).max(80),
        language: z.enum(["fr", "ar", "en"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { callActorScopedRpc } = await import("@/lib/actor-rpc.server");
    return callActorScopedRpc(context.userId, "server_create_seller_store", {
      _name: data.name,
      _slug: data.slug,
      _privacy_version: data.privacyVersion,
      _terms_version: data.termsVersion,
      _language: data.language,
    });
  });

export const registerSellerFileVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        productId: z.string().uuid(),
        fileName: z.string().trim().min(1).max(255),
        sizeBytes: z.number().int().positive().max(52_428_800),
        mimeType: z.string().max(255),
        sha256: z.string().max(128),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { callActorScopedRpc } = await import("@/lib/actor-rpc.server");
    return callActorScopedRpc(context.userId, "server_register_file_version", {
      _product_id: data.productId,
      _file_name: data.fileName,
      _size_bytes: data.sizeBytes,
      _mime_type: data.mimeType,
      _sha256: data.sha256,
    });
  });

export const activateSellerFileVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ versionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { callActorScopedRpc } = await import("@/lib/actor-rpc.server");
    return callActorScopedRpc(context.userId, "server_activate_file_version", {
      _version_id: data.versionId,
    });
  });

export const archiveSellerFileVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ versionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { callActorScopedRpc } = await import("@/lib/actor-rpc.server");
    return callActorScopedRpc(context.userId, "server_archive_file_version", {
      _version_id: data.versionId,
    });
  });

export const submitSellerRating = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        storeId: z.string().uuid(),
        stars: z.number().int().min(1).max(5),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { callActorScopedRpc } = await import("@/lib/actor-rpc.server");
    return callActorScopedRpc(context.userId, "server_submit_seller_rating", {
      _store_id: data.storeId,
      _stars: data.stars,
    });
  });
