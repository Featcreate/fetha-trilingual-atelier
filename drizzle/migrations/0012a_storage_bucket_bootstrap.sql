-- Bootstrap the required Storage buckets for a fresh Algorea Bazaar Supabase project.
-- Product downloads remain private; product previews are made public by migration 0014.
-- Product files accept unrestricted MIME types, with the enforced 50 MiB per-file limit.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('product-files', 'product-files', false, 52428800, NULL),
  ('product-images', 'product-images', false, 10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']::text[])
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
