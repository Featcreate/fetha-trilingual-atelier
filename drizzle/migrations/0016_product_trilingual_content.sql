-- Store machine-generated product title and description in the marketplace languages.
-- The seller's original name/description remain unchanged and authoritative.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS name_translations jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS description_translations jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.products.name_translations IS
  'Automatically generated product title translations keyed by fr, ar, and en.';
COMMENT ON COLUMN public.products.description_translations IS
  'Automatically generated product description translations keyed by fr, ar, and en.';
