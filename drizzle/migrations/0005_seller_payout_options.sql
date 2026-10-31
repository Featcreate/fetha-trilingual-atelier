-- Seller payout preferences and idempotent payout ledger.
-- Additive only. Does not activate payment collection or execute transfers.

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS konnect_direct_payouts_enabled boolean NOT NULL DEFAULT false;

CREATE TYPE public.seller_payout_method AS ENUM ('weekly_manual', 'konnect_direct');
CREATE TYPE public.seller_payout_status AS ENUM ('pending', 'processing', 'paid', 'failed', 'cancelled');

CREATE TABLE public.seller_payout_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL UNIQUE REFERENCES public.stores(id) ON DELETE RESTRICT,
  method public.seller_payout_method NOT NULL DEFAULT 'weekly_manual',
  -- Store only a provider-side wallet identifier; never store credentials or API secrets.
  konnect_wallet_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT konnect_wallet_required CHECK (method <> 'konnect_direct' OR length(trim(coalesce(konnect_wallet_id, ''))) > 0)
);

ALTER TABLE public.seller_payout_preferences ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.seller_payout_preferences TO authenticated;
GRANT ALL ON public.seller_payout_preferences TO service_role;

CREATE POLICY "Sellers read own payout preference"
  ON public.seller_payout_preferences FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = seller_payout_preferences.store_id AND s.owner_id = auth.uid()
  ));
CREATE POLICY "Admins read payout preferences"
  ON public.seller_payout_preferences FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.guard_seller_payout_preference()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin')) THEN
    IF TG_OP = 'UPDATE' AND NEW.store_id <> OLD.store_id THEN
      RAISE EXCEPTION 'payout_store_immutable';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = NEW.store_id AND s.owner_id = auth.uid() AND s.status = 'active') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;
  IF NEW.method = 'konnect_direct' THEN
    IF NOT (SELECT konnect_direct_payouts_enabled FROM public.platform_settings WHERE id = true) THEN
      RAISE EXCEPTION 'konnect_direct_payouts_not_enabled';
    END IF;
    IF length(trim(coalesce(NEW.konnect_wallet_id, ''))) = 0 THEN
      RAISE EXCEPTION 'konnect_wallet_required';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER seller_payout_preferences_guard
  BEFORE INSERT OR UPDATE ON public.seller_payout_preferences
  FOR EACH ROW EXECUTE FUNCTION public.guard_seller_payout_preference();

CREATE TABLE public.seller_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE RESTRICT,
  method public.seller_payout_method NOT NULL,
  status public.seller_payout_status NOT NULL DEFAULT 'pending',
  currency text NOT NULL DEFAULT 'TND' CHECK (currency ~ '^[A-Z]{3}$'),
  gross_millimes bigint NOT NULL CHECK (gross_millimes > 0),
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
  CONSTRAINT payout_amounts_reconcile CHECK (gross_millimes = commission_millimes + seller_amount_millimes),
  CONSTRAINT payout_provider_method CHECK (
    (method = 'weekly_manual' AND provider = 'manual') OR
    (method = 'konnect_direct' AND provider = 'konnect')
  )
);
CREATE INDEX seller_payouts_store_created_idx ON public.seller_payouts(store_id, created_at DESC);
CREATE INDEX seller_payouts_due_idx ON public.seller_payouts(status, scheduled_for) WHERE status IN ('pending','failed');

ALTER TABLE public.seller_payouts ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.seller_payouts TO authenticated;
GRANT ALL ON public.seller_payouts TO service_role;
CREATE POLICY "Sellers read own payouts"
  ON public.seller_payouts FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stores s
    WHERE s.id = seller_payouts.store_id AND s.owner_id = auth.uid()
  ));
CREATE POLICY "Admins read all payouts"
  ON public.seller_payouts FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.seller_payout_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id uuid NOT NULL REFERENCES public.seller_payouts(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL UNIQUE REFERENCES public.order_items(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  gross_millimes bigint NOT NULL CHECK (gross_millimes > 0),
  commission_millimes bigint NOT NULL CHECK (commission_millimes >= 0),
  seller_amount_millimes bigint NOT NULL CHECK (seller_amount_millimes >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payout_item_amounts_reconcile CHECK (gross_millimes = commission_millimes + seller_amount_millimes)
);
CREATE INDEX seller_payout_items_payout_idx ON public.seller_payout_items(payout_id);
ALTER TABLE public.seller_payout_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.seller_payout_items TO authenticated;
GRANT ALL ON public.seller_payout_items TO service_role;
CREATE POLICY "Sellers read own payout items"
  ON public.seller_payout_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.seller_payouts po
    JOIN public.stores s ON s.id = po.store_id
    WHERE po.id = seller_payout_items.payout_id AND s.owner_id = auth.uid()
  ));
CREATE POLICY "Admins read all payout items"
  ON public.seller_payout_items FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.guard_seller_payout_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (NEW.id, NEW.store_id, NEW.method, NEW.currency, NEW.gross_millimes,
      NEW.commission_bps, NEW.commission_millimes, NEW.seller_amount_millimes,
      NEW.idempotency_key, NEW.provider, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.store_id, OLD.method, OLD.currency, OLD.gross_millimes,
      OLD.commission_bps, OLD.commission_millimes, OLD.seller_amount_millimes,
      OLD.idempotency_key, OLD.provider, OLD.created_at) THEN
    RAISE EXCEPTION 'payout_financial_snapshot_immutable';
  END IF;
  IF OLD.status IN ('paid','cancelled') AND NEW.status <> OLD.status THEN
    RAISE EXCEPTION 'payout_terminal_state';
  END IF;
  IF NEW.status = 'paid' AND (NEW.paid_at IS NULL OR NEW.method = 'konnect_direct' AND NEW.provider_transfer_ref IS NULL) THEN
    RAISE EXCEPTION 'payout_confirmation_required';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER seller_payouts_guard
  BEFORE UPDATE ON public.seller_payouts
  FOR EACH ROW EXECUTE FUNCTION public.guard_seller_payout_update();

COMMENT ON TABLE public.seller_payout_preferences IS
  'Seller-selected payout route. Weekly manual is the default; Konnect direct remains unavailable until platform setting is explicitly enabled after provider confirmation.';
COMMENT ON TABLE public.seller_payouts IS
  'Immutable financial snapshot per seller payout. Unique idempotency_key and provider_transfer_ref prevent duplicate transfers.';
COMMENT ON TABLE public.seller_payout_items IS
  'Each order item can be assigned to at most one payout, preventing double settlement.';
