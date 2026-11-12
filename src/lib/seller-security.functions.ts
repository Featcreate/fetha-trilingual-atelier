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
        sizeBytes: z.number().int().positive().max(50_000_000),
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

export const deleteArchivedSellerFileVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ versionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: version, error: versionError } = await supabaseAdmin
      .from("product_file_versions")
      .select("id,product_id,store_id,file_name,size_bytes,storage_path,status")
      .eq("id", data.versionId)
      .maybeSingle();

    if (versionError || !version) {
      return { data: null, error: { message: "file_version_not_found" } };
    }
    if (version.status !== "archived") {
      if (version.status === "active") {
        const { data: product, error: productError } = await supabaseAdmin
          .from("products")
          .select("is_active")
          .eq("id", version.product_id)
          .maybeSingle();
        if (productError || !product) {
          return { data: null, error: { message: "product_lookup_failed" } };
        }

        if (product.is_active) {
          const { count: activeCount, error: activeCountError } = await supabaseAdmin
            .from("product_file_versions")
            .select("id", { count: "exact", head: true })
            .eq("product_id", version.product_id)
            .eq("status", "active");
          if (activeCountError) {
            return { data: null, error: { message: "active_version_check_failed" } };
          }
          if ((activeCount ?? 0) <= 1) {
            return { data: null, error: { message: "file_last_active_version" } };
          }
        }
      }

      try {
        const { callActorScopedRpc } = await import("@/lib/actor-rpc.server");
        await callActorScopedRpc(context.userId, "server_archive_file_version", {
          _version_id: version.id,
        });
      } catch {
        return { data: null, error: { message: "file_archive_failed" } };
      }
    }

    const { data: store, error: storeError } = await supabaseAdmin
      .from("stores")
      .select("owner_id")
      .eq("id", version.store_id)
      .maybeSingle();
    if (storeError || !store || store.owner_id !== context.userId) {
      return { data: null, error: { message: "forbidden" } };
    }

    // Archived versions cannot enter new checkout snapshots. Existing purchase
    // snapshots are immutable and block physical deletion permanently.
    const { count, error: purchaseError } = await supabaseAdmin
      .from("order_item_files")
      .select("id", { count: "exact", head: true })
      .eq("file_version_id", version.id);
    if (purchaseError) {
      return { data: null, error: { message: "purchase_reference_check_failed" } };
    }
    if ((count ?? 0) > 0) {
      return { data: null, error: { message: "file_version_has_purchases" } };
    }

    const { error: storageError } = await supabaseAdmin.storage
      .from("product-files")
      .remove([version.storage_path]);
    if (storageError) {
      return { data: null, error: { message: "storage_delete_failed" } };
    }

    const { error: auditError } = await supabaseAdmin.from("storage_cleanup_audit").insert({
      file_version_id: version.id,
      storage_path: version.storage_path,
      decision: "deleted",
      reason: "seller_manual_deletion",
      decided_by: context.userId,
    });
    if (auditError) {
      // The object is already removed; surface the audit failure for operator review.
      return { data: null, error: { message: "storage_deleted_audit_failed" } };
    }

    return { data: { deletedBytes: Number(version.size_bytes) }, error: null };
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
