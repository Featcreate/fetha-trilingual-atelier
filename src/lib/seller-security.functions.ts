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

export const deleteSellerFileVersion = createServerFn({ method: "POST" })
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

    const { data: store, error: storeError } = await supabaseAdmin
      .from("stores")
      .select("owner_id")
      .eq("id", version.store_id)
      .maybeSingle();
    if (storeError || !store || store.owner_id !== context.userId) {
      return { data: null, error: { message: "forbidden" } };
    }

    // Avoid changing the product's active file set when an existing purchase
    // already depends on this version. Recheck after archival to close the race
    // with a checkout that began immediately before the archive committed.
    const { count: existingPurchases, error: initialPurchaseError } = await supabaseAdmin
      .from("order_item_files")
      .select("id", { count: "exact", head: true })
      .eq("file_version_id", version.id);
    if (initialPurchaseError) {
      return { data: null, error: { message: "purchase_reference_check_failed" } };
    }
    if ((existingPurchases ?? 0) > 0) {
      return { data: null, error: { message: "file_version_has_purchases" } };
    }

    // Archive active and unfinished uploads first. The database serializes this
    // transition with checkout and rejects removal of a product's last active file.
    if (version.status !== "archived") {
      const { callActorScopedRpc } = await import("@/lib/actor-rpc.server");
      const { error: archiveError } = await callActorScopedRpc(
        context.userId,
        "server_archive_file_version",
        { _version_id: version.id },
      );
      if (archiveError) {
        return {
          data: null,
          error: {
            message:
              archiveError.message === "file_last_active_version"
                ? "file_last_active_version"
                : "file_archive_failed",
          },
        };
      }
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

    // Record eligibility before the irreversible Storage operation. The audit table
    // is append-only, so a failed removal leaves a truthful eligibility record.
    const { error: eligibilityAuditError } = await supabaseAdmin
      .from("storage_cleanup_audit")
      .insert({
        file_version_id: version.id,
        storage_path: version.storage_path,
        decision: "dry_run_eligible",
        reason: "seller_manual_deletion_eligible",
        decided_by: context.userId,
      });
    if (eligibilityAuditError) {
      return { data: null, error: { message: "storage_audit_failed" } };
    }

    // Pending uploads may not have created their Storage object yet.
    const separator = version.storage_path.lastIndexOf("/");
    const folder = version.storage_path.slice(0, separator);
    const objectName = version.storage_path.slice(separator + 1);
    const { data: objects, error: listError } = await supabaseAdmin.storage
      .from("product-files")
      .list(folder, { search: objectName, limit: 100 });
    if (listError) {
      return { data: null, error: { message: "storage_lookup_failed" } };
    }

    const objectExists = (objects ?? []).some((object) => object.name === objectName);
    if (objectExists) {
      const { error: storageError } = await supabaseAdmin.storage
        .from("product-files")
        .remove([version.storage_path]);
      if (storageError) {
        return { data: null, error: { message: "storage_delete_failed" } };
      }
    }

    const { error: auditError } = await supabaseAdmin.from("storage_cleanup_audit").insert({
      file_version_id: version.id,
      storage_path: version.storage_path,
      decision: "deleted",
      reason: "seller_manual_deletion",
      decided_by: context.userId,
    });
    if (auditError) {
      return {
        data: { deletedBytes: objectExists ? Number(version.size_bytes) : 0 },
        error: { message: "storage_deleted_audit_failed" },
      };
    }

    return { data: { deletedBytes: objectExists ? Number(version.size_bytes) : 0 }, error: null };
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
