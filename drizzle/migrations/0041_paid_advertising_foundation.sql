-- Paid advertising foundation. Draft only until explicitly applied to Supabase.
-- iPay checkout stays disabled; payment verification is implemented only after provider contract validation.

CREATE TABLE public.paid_advertising_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 3 AND 120),
  description text NOT NULL CHECK (length(trim(description)) BETWEEN 10 AND 1000),
  image_path text NOT NULL CHECK (length(trim(image_path)) BETWEEN 1 AND 500),
  destination_url text NOT NULL CHECK (destination_url ~ '^https://'),
  duration_days smallint NOT NULL CHECK (duration_days IN (7, 14, 30)),
  price_millimes bigint NOT NULL CHECK (price_millimes IN (20000, 35000, 60000)),
  currency text NOT NULL DEFAULT 'TND' CHECK (currency = 'TND'),
  status text NOT NULL DEFAULT 'awaiting_payment'
    CHECK (status IN ('awaiting_payment','payment_pending','pending_review','approved','rejected','active','expired','cancelled','refunded')),
  payment_status text NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending','verified','failed','refunded')),
  payment_provider text NOT NULL DEFAULT 'ipay' CHECK (payment_provider = 'ipay'),
  ipay_payment_ref text UNIQUE,
  ipay_payment_url text,
  paid_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at timestamptz,
  rejection_reason text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paid_advertising_price_duration_check CHECK (
    (duration_days = 7 AND price_millimes = 20000) OR
    (duration_days = 14 AND price_millimes = 35000) OR
    (duration_days = 30 AND price_millimes = 60000)
  ),
  CONSTRAINT paid_advertising_payment_state_check CHECK (
    (payment_status <> 'verified' OR (ipay_payment_ref IS NOT NULL AND paid_at IS NOT NULL))
  ),
  CONSTRAINT paid_advertising_active_window_check CHECK (
    (status <> 'active') OR
    (payment_status = 'verified' AND starts_at IS NOT NULL AND ends_at IS NOT NULL AND ends_at > starts_at)
  )
);

CREATE OR REPLACE FUNCTION public.guard_paid_advertising_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $
BEGIN
  IF NEW.advertiser_id IS DISTINCT FROM OLD.advertiser_id
    OR NEW.duration_days IS DISTINCT FROM OLD.duration_days
    OR NEW.price_millimes IS DISTINCT FROM OLD.price_millimes
    OR NEW.currency IS DISTINCT FROM OLD.currency THEN
    RAISE EXCEPTION 'paid_advertising_commercial_snapshot_immutable';
  END IF;
  RETURN NEW;
END;
$;

CREATE TRIGGER paid_advertising_snapshot_guard
  BEFORE UPDATE ON public.paid_advertising_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_paid_advertising_snapshot();
REVOKE ALL ON FUNCTION public.guard_paid_advertising_snapshot() FROM PUBLIC, anon, authenticated;

CREATE INDEX paid_advertising_owner_created_idx
  ON public.paid_advertising_orders(advertiser_id, created_at DESC);
CREATE INDEX paid_advertising_status_window_idx
  ON public.paid_advertising_orders(status, starts_at, ends_at);

ALTER TABLE public.paid_advertising_orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.paid_advertising_orders FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.paid_advertising_orders TO authenticated;
GRANT SELECT ON TABLE public.paid_advertising_orders TO anon;
GRANT ALL ON TABLE public.paid_advertising_orders TO service_role;

CREATE POLICY "Advertisers read their own ad orders"
  ON public.paid_advertising_orders FOR SELECT TO authenticated
  USING (advertiser_id = (SELECT auth.uid()));
CREATE POLICY "Admins read all paid ad orders"
  ON public.paid_advertising_orders FOR SELECT TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'));
CREATE POLICY "Public reads currently active paid ads"
  ON public.paid_advertising_orders FOR SELECT TO anon, authenticated
  USING (
    status = 'active' AND payment_status = 'verified'
    AND starts_at <= now() AND ends_at > now()
  );

-- Creative files stay private; server functions issue short-lived URLs only for approved/public ads.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('advertising-assets', 'advertising-assets', false, 10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/avif'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Advertisers upload own creative assets"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'advertising-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "Advertisers read own creative assets"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'advertising-assets'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY "Admins manage advertising creative assets"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'advertising-assets' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'advertising-assets' AND public.has_role(auth.uid(), 'admin'));

-- Serialize activation attempts so concurrent approvals cannot exceed three active placements.
CREATE OR REPLACE FUNCTION public.guard_paid_advertising_activation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  _active_count integer;
BEGIN
  IF NEW.status = 'active' THEN
    IF TG_OP = 'INSERT' THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('algorea-paid-ad-slots', 0));
      SELECT count(*) INTO _active_count
      FROM public.paid_advertising_orders
      WHERE status = 'active' AND ends_at > now() AND id <> NEW.id;
      IF _active_count >= 3 THEN
        RAISE EXCEPTION 'paid_advertising_slots_full';
      END IF;
    ELSIF OLD.status IS DISTINCT FROM 'active' THEN
      PERFORM pg_advisory_xact_lock(hashtextextended('algorea-paid-ad-slots', 0));
      SELECT count(*) INTO _active_count
      FROM public.paid_advertising_orders
      WHERE status = 'active' AND ends_at > now() AND id <> NEW.id;
      IF _active_count >= 3 THEN
        RAISE EXCEPTION 'paid_advertising_slots_full';
      END IF;
    END IF;
    IF NEW.payment_status <> 'verified' OR NEW.paid_at IS NULL THEN
      RAISE EXCEPTION 'paid_advertising_payment_not_verified';
    END IF;
    IF NEW.starts_at IS NULL OR NEW.ends_at IS NULL OR NEW.ends_at <= NEW.starts_at THEN
      RAISE EXCEPTION 'paid_advertising_invalid_schedule';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER paid_advertising_activation_guard
  BEFORE INSERT OR UPDATE ON public.paid_advertising_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_paid_advertising_activation();
REVOKE ALL ON FUNCTION public.guard_paid_advertising_activation() FROM PUBLIC, anon, authenticated;

-- Add an independent advertising revenue classification to the append-only ledger.
ALTER TABLE public.platform_financial_ledger_entries
  DROP CONSTRAINT IF EXISTS platform_financial_ledger_entries_entry_type_check;
ALTER TABLE public.platform_financial_ledger_entries
  ADD CONSTRAINT platform_financial_ledger_entries_entry_type_check CHECK (entry_type IN (
    'buyer_collection','provider_settlement','platform_commission','seller_payable',
    'seller_payout','provider_fee','fx_conversion','refund','chargeback','adjustment',
    'advertising_revenue'
  ));

ALTER TABLE public.platform_financial_ledger_entries
  ADD COLUMN advertising_order_id uuid
    REFERENCES public.paid_advertising_orders(id) ON DELETE RESTRICT;

ALTER TABLE public.platform_financial_ledger_entries
  ADD CONSTRAINT platform_ledger_advertising_scope_check CHECK (
    (entry_type = 'advertising_revenue'
      AND advertising_order_id IS NOT NULL
      AND order_id IS NULL AND order_item_id IS NULL
      AND seller_payout_id IS NULL AND seller_id IS NULL AND store_id IS NULL)
    OR (entry_type <> 'advertising_revenue' AND advertising_order_id IS NULL)
    OR (entry_type = 'refund'
      AND advertising_order_id IS NOT NULL
      AND order_id IS NULL AND order_item_id IS NULL
      AND seller_payout_id IS NULL AND seller_id IS NULL AND store_id IS NULL)
  );

CREATE UNIQUE INDEX platform_ledger_advertising_order_revenue_unique
  ON public.platform_financial_ledger_entries(advertising_order_id)
  WHERE entry_type = 'advertising_revenue';
CREATE UNIQUE INDEX platform_ledger_advertising_order_refund_unique
  ON public.platform_financial_ledger_entries(advertising_order_id)
  WHERE entry_type = 'refund' AND advertising_order_id IS NOT NULL;

CREATE INDEX platform_ledger_advertising_order_idx
  ON public.platform_financial_ledger_entries(advertising_order_id)
  WHERE advertising_order_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_paid_advertising_ledger_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE _ad record;
BEGIN
  IF NEW.entry_type IN ('advertising_revenue','refund')
     AND NEW.advertising_order_id IS NOT NULL THEN
    SELECT id, payment_status, price_millimes, currency, ipay_payment_ref
      INTO _ad
    FROM public.paid_advertising_orders
    WHERE id = NEW.advertising_order_id;
    IF NOT FOUND
      OR _ad.payment_status NOT IN ('verified','refunded')
      OR _ad.currency <> 'TND'
      OR NEW.transaction_currency <> 'TND'
      OR NEW.accounting_currency <> 'TND'
      OR NEW.transaction_currency_exponent <> 3
      OR NEW.accounting_amount_millimes <> NEW.transaction_amount_minor
      OR NEW.external_reference IS DISTINCT FROM _ad.ipay_payment_ref
      OR NEW.order_id IS NOT NULL OR NEW.order_item_id IS NOT NULL
      OR NEW.seller_id IS NOT NULL OR NEW.store_id IS NOT NULL
      OR (NEW.entry_type = 'advertising_revenue' AND (
        NEW.transaction_amount_minor <> _ad.price_millimes OR NEW.entry_side <> 'credit'
      ))
      OR (NEW.entry_type = 'refund' AND (
        NEW.transaction_amount_minor <> _ad.price_millimes OR NEW.entry_side <> 'debit'
      ))
    THEN
      RAISE EXCEPTION 'platform_ledger_advertising_entry_mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_ledger_validate_advertising_insert
  BEFORE INSERT ON public.platform_financial_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_paid_advertising_ledger_entry();
REVOKE ALL ON FUNCTION public.guard_paid_advertising_ledger_entry() FROM PUBLIC, anon, authenticated;


-- Admin activation is atomic with the independent advertising revenue ledger entry.
CREATE OR REPLACE FUNCTION public.admin_activate_paid_advertising_order(_ad_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $activate$
DECLARE
  _ad public.paid_advertising_orders%ROWTYPE;
  _now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO _ad
  FROM public.paid_advertising_orders
  WHERE id = _ad_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'paid_advertising_not_found'; END IF;
  IF _ad.status = 'active' THEN RETURN 'already_active'; END IF;
  IF _ad.payment_status <> 'verified' OR _ad.paid_at IS NULL OR _ad.ipay_payment_ref IS NULL THEN
    RAISE EXCEPTION 'paid_advertising_payment_not_verified';
  END IF;
  IF _ad.status NOT IN ('pending_review','approved') THEN
    RAISE EXCEPTION 'paid_advertising_not_reviewable';
  END IF;

  UPDATE public.paid_advertising_orders
  SET status = 'active', reviewed_by = auth.uid(), reviewed_at = _now,
      starts_at = _now, ends_at = _now + make_interval(days => duration_days)
  WHERE id = _ad_id;

  INSERT INTO public.platform_financial_ledger_entries (
    entry_type, entry_side, transaction_currency, transaction_amount_minor,
    transaction_currency_exponent, accounting_currency, accounting_amount_millimes,
    source, external_reference, idempotency_key, advertising_order_id
  ) VALUES (
    'advertising_revenue', 'credit', 'TND', _ad.price_millimes,
    3, 'TND', _ad.price_millimes, 'ipay_paid_advertising',
    _ad.ipay_payment_ref, 'advertising-revenue:' || _ad.id::text, _ad.id
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN 'activated';
END;
$activate$;

REVOKE ALL ON FUNCTION public.admin_activate_paid_advertising_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_activate_paid_advertising_order(uuid) TO authenticated;

COMMENT ON TABLE public.paid_advertising_orders IS
  'Paid advertising requests. iPay references are recorded separately from product orders; public visibility requires verified payment and an active approved schedule. Checkout remains gated by provider verification.';
