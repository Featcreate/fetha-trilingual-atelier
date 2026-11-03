// One shared inventory for homepage links, seller forms, and catalogue filters.
export const PRODUCT_TYPES = [
  "ebook", "pdf", "template", "educational", "bundle", "software", "app",
  "printable", "planner", "course", "worksheets", "flashcards", "audio",
  "video", "graphics", "other",
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];