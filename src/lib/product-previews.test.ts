import { describe, expect, it } from "vitest";
import { isMissingGalleryTable, previewObjectPath, validPreviewImage } from "./product-previews";
import { PRODUCT_TYPES } from "./product-types";
import { getCategory, getProductTypeLabel, getSubcategoryLabel, isValidProductCategory } from "./product-categories";

describe("preview image rules", () => {
  it("accepts the exact 10 MiB limit and rejects larger files", () => {
    expect(validPreviewImage({ size: 10485760, type: "image/png" })).toBe(true);
    expect(validPreviewImage({ size: 10485761, type: "image/png" })).toBe(false);
  });
  it("rejects empty and non-image uploads including SVG", () => {
    expect(validPreviewImage({ size: 0, type: "image/jpeg" })).toBe(false);
    expect(validPreviewImage({ size: 1, type: "image/svg+xml" })).toBe(false);
    expect(validPreviewImage({ size: 1, type: "application/pdf" })).toBe(false);
  });
  it("scopes immutable image names to store, product and media kind", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(previewObjectPath(id, id, "gallery", id, "image/png")).toBe(`${id}/${id}/gallery/${id}.png`);
    expect(() => previewObjectPath("../other", id, "cover", id, "image/png")).toThrow();
  });
  it("tolerates only the absent gallery relation, not other errors", () => {
    expect(isMissingGalleryTable({ code: "42P01", message: 'relation "public.product_images" does not exist' })).toBe(true);
    expect(isMissingGalleryTable({ code: "PGRST205", message: "Could not find the table 'public.product_images' in the schema cache" })).toBe(true);
    expect(isMissingGalleryTable({ code: "42501", message: "permission denied for product_images" })).toBe(false);
    expect(isMissingGalleryTable({ code: "42P01", message: "relation stores missing" })).toBe(false);
  });
  it("exposes the ten approved top-level product categories", () => {
    expect([...PRODUCT_TYPES]).toEqual([
      "graphisme", "modeles", "livres-numeriques", "ressources-educatives",
      "agendas-organisation", "logiciels-applications", "contenus-audio-visuels",
      "formations-cours", "creation-fabrication-numerique", "packs-bundles-numeriques",
    ]);
  });
});