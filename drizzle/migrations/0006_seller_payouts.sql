-- Seller payout preferences and payout batches.
-- Uses seller_ledger_entries as the source of payable balances.
-- Additive only: no payment collection, provider API call, or money transfer is enabled.

DO $$ BEGIN
  CREATE TYPE public.seller_payout_method AS ENUM ('weekly_manual', 'konnect_direct');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.seller_payout_status AS ENUM ('pending', 'processing', 'paid', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS konnect_direct_payouts_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.seller_payout_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE RESTRICT,
  method public.seller_payout_method NOT NULL DEFAULT 'weekly_manual',
  konnect_wallet_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_payout_preferences_wallet_check
    CHECK (method <> 'konnect_direct' OR length(trim(coalesce(konnect_wallet_id, ''))) > 0)
);

ALTER TABLE public.seller_payout_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.seller_payout_preferences TO authenticated;
GRANT ALL ON public.seller_payout_preferences TO service_role;

DROP POLICY IF EXISTS "Sellers read own payout preference" ON public.seller_payout_preferences;
CREATE POLICY "Sellers read own payout preference"
  ON public.seller_payout_preferences FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s
    WHERE s.id = seller_payout_preferences.store_id AND s.owner_id = auth.uid()));
DROP POLICY IF EXISTS "Admins read payout preferences" ON public.seller_payout_preferences;
CREATE POLICY "Admins read payout preferences"
  ON public.seller_payout_preferences FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.guard_seller_payout_preference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    IF TG_OP = 'UPDATE' AND NEW.store_id IS DISTINCT FROM OLD.store_id THEN
      RAISE EXCEPTION 'payout_store_immutable';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.stores s
      WHERE s.id = NEW.store_id AND s.owner_id = auth.uid() AND s.status = 'active') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;
  IF NEW.method = 'konnect_direct' THEN
    IF NOT EXISTS (SELECT 1 FROM public.platform_settings
      WHERE id = true AND konnect_direct_payouts_enabled = true) THEN
      RAISE EXCEPTION 'konnect_direct_payouts_not_enabled';
    END IF;
    IF length(trim(coalesce(NEW.konnect_wallet_id, ''))) = 0 THEN
      RAISE EXCEPTION 'konnect_wallet_required';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS seller_payout_preferences_guard ON public.seller_payout_preferences;
CREATE TRIGGER seller_payout_preferences_guard
  BEFORE INSERT OR UPDATE ON public.seller_payout_preferences
  FOR EACH ROW EXECUTE FUNCTION public.guard_seller_payout_preference();

CREATE TABLE IF NOT EXISTS public.seller_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  method public.seller_payout_method NOT NULL DEFAULT 'weekly_manual',
  status public.seller_payout_status NOT NULL DEFAULT 'pending',
  currency text NOT NULL DEFAULT 'TND' CHECK (currency ~ '^[A-Z]{3}$'),
  gross_millimes bigint NOT NULL CHECK (gross_millimes > 0),
  discount_millimes bigint NOT NULL DEFAULT 0 CHECK (discount_millimes >= 0),
  commission_bps integer NOT NULL CHECK (commission_bps BETWEEN 0 AND 10000),
  commission_millimes bigint NOT NULL CHECK (commission_millimes >= 0),
  seller_amount_millimes bigint NOT NULL CHECK (seller_amount_millimes >= 0),
  idempotency_key text NOT NULL UNIQUE CHECK (length(trim(idempotency_key)) BETWEEN 8 AND 200),
  provider text NOT NULL DEFAULT 'manual' CHECK (provider IN ('manual','konnect')),
  provider_transfer_ref text UNIQUE,
  failure_reason text,
  scheduled_for timestamptz,
  initiated_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_payouts_reconcile
    CHECK (gross_millimes = discount_millimes + commission_millimes + seller_amount_millimes),
  CONSTRAINT seller_payouts_method_provider
    CHECK ((method = 'weekly_manual' AND provider = 'manual')
        OR (method = 'konnect_direct' AND provider = 'konnect'))
);

CREATE INDEX IF NOT EXISTS seller_payouts_store_created_idx
  ON public.seller_payouts(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS seller_payouts_due_idx
  ON public.seller_payouts(status, scheduled_for)
  WHERE status IN ('pending','failed');

ALTER TABLE public.seller_payouts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.seller_payouts TO authenticated;
GRANT ALL ON public.seller_payouts TO service_role;

DROP POLICY IF EXISTS "Sellers read own payouts" ON public.seller_payouts;
CREATE POLICY "Sellers read own payouts"
  ON public.seller_payouts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.stores s
    WHERE s.id = seller_payouts.store_id AND s.owner_id = auth.uid()));
DROP POLICY IF EXISTS "Admins read all payouts" ON public.seller_payouts;
CREATE POLICY "Admins read all payouts"
  ON public.seller_payouts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- A payout line is backed by one immutable sale_net ledger entry.
-- Unique ledger_entry_id prevents paying the same sale twice.
CREATE TABLE IF NOT EXISTS public.seller_payout_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id uuid NOT NULL REFERENCES public.seller_payouts(id) ON DELETE RESTRICT,
  ledger_entry_id uuid NOT NULL UNIQUE
    REFERENCES public.seller_ledger_entries(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL UNIQUE
    REFERENCES public.order_items(id) ON DELETE RESTRICT,
  gross_millimes bigint NOT NULL CHECK (gross_millimes > 0),
  discount_millimes bigint NOT NULL DEFAULT 0 CHECK (discount_millimes >= 0),
  commission_millimes bigint NOT NULL CHECK (commission_millimes >= 0),
  seller_amount_millimes bigint NOT NULL CHECK (seller_amount_millimes >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT seller_payout_items_reconcile
    CHECK (gross_millimes = discount_millimes + commission_millimes + seller_amount_millimes)
);
CREATE INDEX IF NOT EXISTS seller_payout_items_payout_idx
  ON public.seller_payout_items(payout_id);

ALTER TABLE public.seller_payout_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.seller_payout_items TO authenticated;
GRANT ALL ON public.seller_payout_items TO service_role;

DROP POLICY IF EXISTS "Sellers read own payout items" ON public.seller_payout_items;
CREATE POLICY "Sellers read own payout items"
  ON public.seller_payout_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.seller_payouts po
    JOIN public.stores s ON s.id = po.store_id
    WHERE po.id = seller_payout_items.payout_id AND s.owner_id = auth.uid()
  ));
DROP POLICY IF EXISTS "Admins read all payout items" ON public.seller_payout_items;
CREATE POLICY "Admins read all payout items"
  ON public.seller_payout_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.guard_seller_payout_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p record; l record; oi record;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'payout_items_immutable';
  END IF;
  SELECT * INTO p FROM public.seller_payouts WHERE id = NEW.payout_id FOR UPDATE;
  IF NOT FOUND OR p.status <> 'pending' THEN RAISE EXCEPTION 'payout_not_open'; END IF;
  SELECT * INTO l FROM public.seller_ledger_entries WHERE id = NEW.ledger_entry_id;
  IF NOT FOUND OR l.entry_type <> 'sale_net' OR l.store_id <> p.store_id THEN
    RAISE EXCEPTION 'ledger_entry_mismatch';
  END IF;
  SELECT * INTO oi FROM public.order_items WHERE id = l.order_item_id;
  IF NOT FOUND OR oi.store_id <> p.store_id OR oi.seller_id <> l.seller_id
     OR oi.order_id IS NULL OR oi.seller_net_millimes <> l.amount_millimes
     OR oi.commission_bps <> p.commission_bps
     OR oi.payable_millimes <> oi.gross_millimes - oi.discount_millimes
     OR oi.commission_millimes <> round(oi.payable_millimes::numeric * oi.commission_bps / 10000)::bigint
     OR oi.seller_net_millimes <> oi.payable_millimes - oi.commission_millimes THEN
    RAISE EXCEPTION 'order_item_ledger_mismatch';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = oi.order_id AND o.status = 'paid'
      AND o.payment_mode = 'verified') THEN
    RAISE EXCEPTION 'sale_not_verified';
  END IF;
  IF NEW.order_item_id <> oi.id
     OR NEW.seller_amount_millimes <> l.amount_millimes
     OR NEW.gross_millimes <> oi.gross_millimes
     OR NEW.discount_millimes <> oi.discount_millimes
     OR NEW.commission_millimes <> oi.commission_millimes THEN
    RAISE EXCEPTION 'payout_item_amount_mismatch';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS seller_payout_items_guard ON public.seller_payout_items;
CREATE TRIGGER seller_payout_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.seller_payout_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_seller_payout_item();

CREATE OR REPLACE FUNCTION public.guard_seller_payout_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.id, NEW.store_id, NEW.method, NEW.currency, NEW.gross_millimes, NEW.discount_millimes,
      NEW.commission_bps, NEW.commission_millimes, NEW.seller_amount_millimes,
      NEW.idempotency_key, NEW.provider, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.store_id, OLD.method, OLD.currency, OLD.gross_millimes, OLD.discount_millimes,
      OLD.commission_bps, OLD.commission_millimes, OLD.seller_amount_millimes,
      OLD.idempotency_key, OLD.provider, OLD.created_at) THEN
    RAISE EXCEPTION 'payout_financial_snapshot_immutable';
  END IF;
  IF OLD.status IN ('paid','cancelled') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'payout_terminal_state';
  END IF;
  IF NEW.status IN ('processing','paid') THEN
    IF NOT EXISTS (SELECT 1 FROM public.seller_payout_items WHERE payout_id = NEW.id) THEN
      RAISE EXCEPTION 'payout_has_no_items';
    END IF;
    IF NEW.gross_millimes <> (SELECT coalesce(sum(gross_millimes),0) FROM public.seller_payout_items WHERE payout_id = NEW.id)
       OR NEW.discount_millimes <> (SELECT coalesce(sum(discount_millimes),0) FROM public.seller_payout_items WHERE payout_id = NEW.id)
       OR NEW.commission_millimes <> (SELECT coalesce(sum(commission_millimes),0) FROM public.seller_payout_items WHERE payout_id = NEW.id)
       OR NEW.seller_amount_millimes <> (SELECT coalesce(sum(seller_amount_millimes),0) FROM public.seller_payout_items WHERE payout_id = NEW.id) THEN
      RAISE EXCEPTION 'payout_items_total_mismatch';
    END IF;
  END IF;
  IF NEW.status = 'paid' AND (NEW.paid_at IS NULL
      OR (NEW.method = 'konnect_direct' AND NEW.provider_transfer_ref IS NULL)) THEN
    RAISE EXCEPTION 'payout_confirmation_required';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS seller_payouts_guard ON public.seller_payouts;
CREATE TRIGGER seller_payouts_guard
  BEFORE UPDATE ON public.seller_payouts
  FOR EACH ROW EXECUTE FUNCTION public.guard_seller_payout_update();

COMMENT ON TABLE public.seller_payout_preferences IS
  'Seller payout route; weekly manual is the default. Konnect direct remains disabled until explicitly enabled after provider capability verification.';
COMMENT ON TABLE public.seller_payouts IS
  'Payout batch with immutable amount snapshot and idempotency key.';
COMMENT ON TABLE public.seller_payout_items IS
  'Payout lines must reference verified sale_net ledger entries; each ledger entry can be paid only once.';
