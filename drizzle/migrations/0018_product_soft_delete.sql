-- Soft-delete products without breaking historical order references or buyer entitlements.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.products.deleted_at IS
  'Soft deletion timestamp. Deleted products are hidden from seller listings and new catalog purchases; historical order references and purchased files are retained.';
