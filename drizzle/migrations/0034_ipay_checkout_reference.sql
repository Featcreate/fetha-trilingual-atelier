-- Store iPay's one-shot reference separately from Konnect's provider fields.
-- Additive only: does not activate checkout, alter settlement, or grant client access.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS ipay_payment_ref text,
  ADD COLUMN IF NOT EXISTS ipay_payment_url text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_ipay_payment_ref_unique
  ON public.orders(ipay_payment_ref)
  WHERE ipay_payment_ref IS NOT NULL;

COMMENT ON COLUMN public.orders.ipay_payment_ref IS
  'iPay one-shot transaction identifier. Never treated as proof of payment without authoritative provider verification.';
COMMENT ON COLUMN public.orders.ipay_payment_url IS
  'iPay hosted checkout URL for the buyer. Separate from Konnect payment URL.';
