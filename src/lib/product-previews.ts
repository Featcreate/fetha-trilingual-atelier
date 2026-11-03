import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"] as const;
export const IMAGE_ACCEPT = IMAGE_MIME_TYPES.join(",");
export type PreviewImage = { id: string; product_id: string; image_path: string; sort_order: number; created_at: string };
// Local pending-migration type: never edit the generated database types.
type PreviewDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables"> & {
    Tables: Database["public"]["Tables"] & {
      product_images: {
        Row: PreviewImage;
        Insert: { id?: string; product_id: string; image_path: string; sort_order?: number; created_at?: string };
        Update: { sort_order?: number };
        Relationships: [];
      };
    };
  };
};
const previewClient = supabase as SupabaseClient<PreviewDatabase>;

export function isMissingGalleryTable(error: { code?: string; message?: string }) {
  return (error.code === "42P01" || error.code === "PGRST205") &&
    /\bproduct_images\b/.test(error.message ?? "");
}

export async function loadProductGallery(productId: string) {
  const { data, error } = await previewClient.from("product_images")
    .select("*").eq("product_id", productId)
    .order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  if (error) {
    if (isMissingGalleryTable(error)) return { available: false, images: [] as PreviewImage[] };
    throw error;
  }
  return { available: true, images: data ?? [] };
}

export function validPreviewImage(file: Pick<File, "size" | "type">) {
  return file.size > 0 && file.size <= MAX_IMAGE_BYTES &&
    IMAGE_MIME_TYPES.some((type) => type === file.type);
}

export function previewObjectPath(storeId: string, productId: string, kind: "cover" | "gallery", id: string, mime: string) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif",
  };
  if (![storeId, productId, id].every((value) => uuid.test(value)) || !extensions[mime]) throw new Error("invalid_preview_path");
  return `${storeId}/${productId}/${kind}/${id}.${extensions[mime]}`;
}

export async function saveProductPreviews(storeId: string, productId: string, cover: File | null, gallery: File[]) {
  if (!cover && !gallery.length) return;
  if ([...(cover ? [cover] : []), ...gallery].some((file) => !validPreviewImage(file))) throw new Error("invalid_preview_image");
  // Detect the pending table before uploading any gallery bytes or replacing a cover.
  const existing = gallery.length ? await loadProductGallery(productId) : null;
  if (existing && !existing.available) throw new Error("preview_setup_required");
  async function upload(file: File, kind: "cover" | "gallery") {
    const path = previewObjectPath(storeId, productId, kind, crypto.randomUUID(), file.type);
    const { error } = await supabase.storage.from("product-images").upload(path, file, {
      contentType: file.type, upsert: false,
    });
    if (error) throw error;
    return path;
  }
  if (cover) {
    const path = await upload(cover, "cover");
    const { error, data } = await supabase.from("products").update({ image_path: path })
      .eq("id", productId).eq("store_id", storeId).select("id").single();
    if (error || !data) throw error ?? new Error("preview_save_failed");
  }
  const nextOrder = Math.max(-1, ...(existing?.images ?? []).map((image) => image.sort_order)) + 1;
  for (const [index, file] of gallery.entries()) {
    const path = await upload(file, "gallery");
    const { error } = await previewClient.from("product_images").insert({ product_id: productId, image_path: path, sort_order: nextOrder + index });
    if (error) throw error;
  }
  // Never remove old bytes or metadata on edits or partial failures.
}