-- Broaden digital product types without changing existing product rows.
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_product_type_check;
ALTER TABLE public.products ADD CONSTRAINT products_product_type_check
  CHECK (product_type IN (
    'ebook','pdf','template','educational','bundle','software','app',
    'printable','planner','course','worksheets','flashcards',
    'audio','video','graphics','other'
  ));
